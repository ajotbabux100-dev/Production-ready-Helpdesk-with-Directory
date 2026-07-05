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
