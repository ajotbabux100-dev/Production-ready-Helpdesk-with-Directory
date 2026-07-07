from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication


class IdleAwareJWTAuthentication(JWTAuthentication):
    """Same as JWTAuthentication, but also enforces the idle-logout server
    side - the frontend's own JS timer can't be trusted alone (a frozen or
    backgrounded tab, disabled JS, or a tampered client would never log out
    on their own). Deliberately does NOT refresh last_activity_at here -
    that only happens via the /auth/heartbeat/ endpoint (see views.py),
    which the frontend calls on real user activity. If every authenticated
    request refreshed it, routine background polling (e.g. the
    notification-count poll) would keep a truly idle session alive forever.
    """

    def get_user(self, validated_token):
        # Every authenticated request touches user.role (has_perm_key/
        # is_admin, checked on nearly every view) and often user.department
        # too - without this, simplejwt's default get_user() does a bare
        # User.objects.get(), so both FKs cost a second/third query on every
        # single request rather than being joined into the first one.
        from .models import User
        from rest_framework_simplejwt.settings import api_settings
        from rest_framework_simplejwt.exceptions import InvalidToken
        from rest_framework.exceptions import AuthenticationFailed as DRFAuthenticationFailed

        try:
            user_id = validated_token[api_settings.USER_ID_CLAIM]
        except KeyError:
            raise InvalidToken('Token contained no recognizable user identification')

        try:
            user = User.objects.select_related('role', 'department').get(
                **{api_settings.USER_ID_FIELD: user_id}
            )
        except User.DoesNotExist:
            raise DRFAuthenticationFailed('User not found', code='user_not_found')

        if not user.is_active:
            raise DRFAuthenticationFailed('User is inactive', code='user_inactive')

        return user

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None
        user, validated_token = result

        if user.last_activity_at:
            from branding.models import SystemSettings
            timeout_minutes = user.idle_timeout_minutes or SystemSettings.get().default_idle_timeout_minutes
            idle_for = timezone.now() - user.last_activity_at
            if idle_for.total_seconds() > timeout_minutes * 60:
                raise AuthenticationFailed(
                    {'error': 'Session expired due to inactivity.', 'code': 'idle_timeout'},
                    code='idle_timeout',
                )

        return user, validated_token
