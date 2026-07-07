import secrets
import string

from rest_framework import viewsets, generics
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from .models import User, Role, PasswordResetOTP
from .serializers import (
    UserSerializer, UserMinimalSerializer, ChangePasswordSerializer, RoleSerializer,
    ForgotPasswordSerializer, ResetPasswordSerializer,
)
from .permissions import require_perm, IsSuper
from .rbac import permission_catalog
from audit.utils import log_action
from audit.models import AuditLog
from departments.models import Department
from excel_io import build_template, read_upload, build_import_report_base64, BadUpload
from excel_io.core import row_cell
from notifications.email import send_ticket_email


class LoginView(generics.GenericAPIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'

    def post(self, request):
        email = request.data.get('email')
        password = request.data.get('password')
        if not email or not password:
            return Response({'error': 'Email and password are required.'}, status=400)
        user = authenticate(request, username=email, password=password)
        if not user:
            return Response({'error': 'Invalid credentials.'}, status=401)
        if not user.is_active:
            return Response({'error': 'Account is disabled.'}, status=403)
        refresh = RefreshToken.for_user(user)
        user.last_activity_at = timezone.now()
        user.save(update_fields=['last_activity_at'])
        log_action(user, AuditLog.LOGIN, description=f'{user.email} logged in', request=request)
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': UserSerializer(user).data,
        })


class HeartbeatView(generics.GenericAPIView):
    """Called by the frontend on real user activity (throttled client-side)
    to keep the server-side idle check (IdleAwareJWTAuthentication) alive.
    Deliberately not tied to any other endpoint - see that module's
    docstring for why routine API polling must NOT count as activity."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        request.user.last_activity_at = timezone.now()
        request.user.save(update_fields=['last_activity_at'])
        return Response({'status': 'ok'})


class LogoutView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            token = RefreshToken(request.data.get('refresh'))
            token.blacklist()
            log_action(request.user, AuditLog.LOGOUT, description=f'{request.user.email} logged out', request=request)
        except Exception:
            pass
        return Response({'detail': 'Logged out successfully.'})


def _generic_otp_response():
    # A fresh Response per call - DRF Response objects get mutated during
    # rendering, so a single shared instance isn't safe to reuse across requests.
    return Response({'detail': 'If an account exists for that email, a reset code has been sent.'})


class ForgotPasswordView(generics.GenericAPIView):
    """Step 1 of the forgot-password flow: emails a 6-digit one-time code.
    Always returns the same generic message whether or not the email
    matches an account, so this endpoint can't be used to enumerate users."""
    permission_classes = [AllowAny]
    serializer_class = ForgotPasswordSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'otp_request'

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email'].strip().lower()

        user = User.objects.filter(email__iexact=email, is_active=True, is_deleted=False).first()
        if not user:
            return _generic_otp_response()

        code = ''.join(secrets.choice(string.digits) for _ in range(6))
        otp = PasswordResetOTP.objects.create(
            user=user, code=code,
            expires_at=timezone.now() + timezone.timedelta(minutes=PasswordResetOTP.VALIDITY_MINUTES),
        )
        send_ticket_email(
            'Your password reset code',
            user.email,
            'password_reset_otp',
            {
                'user': user, 'otp': code, 'valid_minutes': PasswordResetOTP.VALIDITY_MINUTES,
                '_plain_text': f'Your password reset code is {code}. It expires in {PasswordResetOTP.VALIDITY_MINUTES} minutes.',
            },
        )
        log_action(user, AuditLog.PASSWORD_RESET_REQUESTED,
                   description=f'{user.email} requested a password reset code', request=request)
        return _generic_otp_response()


class ResetPasswordView(generics.GenericAPIView):
    """Step 2: verifies the emailed code and sets the new password. Wrong
    codes count against both the per-request throttle and the OTP's own
    attempt limit, so a code can't be brute-forced even within the
    throttle window."""
    permission_classes = [AllowAny]
    serializer_class = ResetPasswordSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'otp_verify'

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email'].strip().lower()
        code = serializer.validated_data['code']
        new_password = serializer.validated_data['new_password']

        invalid_response = Response({'error': 'Invalid or expired code.'}, status=400)
        user = User.objects.filter(email__iexact=email, is_active=True, is_deleted=False).first()
        if not user:
            return invalid_response

        otp = PasswordResetOTP.objects.filter(user=user, used_at__isnull=True).order_by('-created_at').first()
        if not otp or not otp.is_valid:
            return invalid_response
        if not secrets.compare_digest(otp.code, code):
            otp.attempts += 1
            otp.save(update_fields=['attempts'])
            return invalid_response

        otp.used_at = timezone.now()
        otp.save(update_fields=['used_at'])
        user.set_password(new_password)
        user.save()
        log_action(user, AuditLog.PASSWORD_RESET_COMPLETED,
                   description=f'{user.email} reset their password via emailed code', request=request)
        return Response({'detail': 'Password reset successfully. You can now log in.'})


def _sync_department_manager(user, old_dept_id=None, was_manager_tier=None):
    """
    Keep Department.manager in sync with User.role + User.department.
    "Manager tier" = holds the tickets.manage_escalated right (the same
    proxy used elsewhere for what used to be the hardcoded 'manager' role),
    so this keeps working however roles get renamed/reconfigured.
    """
    from departments.models import Department
    is_manager_tier = user.has_perm_key('tickets', 'manage_escalated')

    if was_manager_tier and not is_manager_tier and old_dept_id:
        Department.objects.filter(id=old_dept_id, manager=user).update(manager=None)
        return
    if is_manager_tier:
        if old_dept_id and old_dept_id != user.department_id:
            Department.objects.filter(id=old_dept_id, manager=user).update(manager=None)
        if user.department_id:
            Department.objects.filter(id=user.department_id).update(manager=user)


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.select_related('department', 'role').all()
    serializer_class = UserSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['role', 'department', 'is_active']
    search_fields = ['email', 'first_name', 'last_name']
    ordering_fields = ['first_name', 'date_joined']
    # Users page renders one flat table with no page-through controls, so it
    # needs everyone in one response rather than being silently capped at 20.
    pagination_class = None

    def get_permissions(self):
        if self.action in ['list', 'template']:
            return [require_perm('users', 'view')()]
        if self.action in ['create', 'import_excel']:
            return [require_perm('users', 'add')()]
        if self.action in ['update', 'partial_update']:
            return [require_perm('users', 'edit')()]
        if self.action == 'destroy':
            return [require_perm('users', 'delete')()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        if user.is_admin:
            return User.objects.select_related('department', 'role').filter(is_deleted=False)
        return User.objects.filter(id=user.id, is_deleted=False)

    def perform_destroy(self, instance):
        import re
        from django.utils import timezone
        from rest_framework.exceptions import ValidationError

        if instance.is_last_active_super_admin:
            raise ValidationError(
                'This is the last active Super Admin user. Assign the Super Admin role '
                'to another active user before deleting this account.'
            )

        # Alias is scoped to the original first name, not a global counter -
        # deleting "ajo" gives #ajo1, deleting a later user also named "ajo"
        # gives #ajo2, rather than both/all deleted users sharing one
        # sequence regardless of who they were.
        base_name = re.sub(r'[^a-z0-9]', '', instance.first_name.lower()) or 'user'
        prefix = f'#{base_name}'
        existing_seqs = [
            int(a[len(prefix):])
            for a in User.objects.filter(is_deleted=True, deleted_alias__startswith=prefix)
                .values_list('deleted_alias', flat=True)
            if a[len(prefix):].isdigit()
        ]
        seq = max(existing_seqs, default=0) + 1
        alias = f'{prefix}{seq}'

        instance.is_deleted = True
        instance.deleted_alias = alias
        instance.deleted_at = timezone.now()
        instance.first_name = alias
        instance.last_name = ''
        instance.email = f'deleted_{base_name}{seq}_{instance.id}@deleted.invalid'
        instance.phone = ''
        instance.is_active = False
        instance.department = None
        instance.avatar = None
        instance.set_unusable_password()
        instance.save()

    def perform_create(self, serializer):
        user = serializer.save()
        _sync_department_manager(user)

    def perform_update(self, serializer):
        old_dept_id = serializer.instance.department_id
        was_manager_tier = serializer.instance.has_perm_key('tickets', 'manage_escalated')
        user = serializer.save()
        _sync_department_manager(user, old_dept_id=old_dept_id, was_manager_tier=was_manager_tier)

    SELF_EDITABLE_FIELDS = {'first_name', 'last_name', 'phone', 'avatar', 'password'}

    @action(detail=False, methods=['get', 'patch'], permission_classes=[IsAuthenticated])
    def me(self, request):
        if request.method == 'GET':
            return Response(UserSerializer(request.user).data)
        # Self-service edit: only safe personal fields, never role/department/is_active
        # (those require the users.edit right via the normal update action).
        data = {k: v for k, v in request.data.items() if k in self.SELF_EDITABLE_FIELDS}
        serializer = UserSerializer(request.user, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='switch-role', permission_classes=[IsAuthenticated])
    def switch_role(self, request):
        """Self-service: repoints the caller's active `role` at one of the
        roles an admin has granted them (their current role, or one of
        `assignable_roles`). Does not touch anyone else's account, so it
        needs no `users.edit` right - only the target set is restricted."""
        role_id = request.data.get('role')
        if not role_id:
            return Response({'error': 'role is required.'}, status=400)

        user = request.user
        allowed_ids = {user.role_id} | set(user.assignable_roles.values_list('id', flat=True))
        try:
            role_id = int(role_id)
        except (TypeError, ValueError):
            return Response({'error': 'Invalid role.'}, status=400)
        if role_id not in allowed_ids:
            return Response({'error': 'You are not permitted to switch to that role.'}, status=403)

        old_role = user.role
        if role_id == user.role_id:
            return Response(UserSerializer(user).data)

        new_role = Role.objects.get(pk=role_id)
        if user.is_last_active_super_admin and not new_role.is_super:
            return Response(
                {'error': 'You are the last active Super Admin user - switch someone else into '
                           'that role before switching yourself out of it.'},
                status=400,
            )
        old_dept_id = user.department_id
        was_manager_tier = user.has_perm_key('tickets', 'manage_escalated')
        user.role = new_role
        user.save(update_fields=['role'])
        _sync_department_manager(user, old_dept_id=old_dept_id, was_manager_tier=was_manager_tier)

        log_action(user, AuditLog.ROLE_SWITCHED,
                   description=f'{user.email} switched active role from {old_role.name} to {new_role.name}',
                   request=request)
        return Response(UserSerializer(user).data)

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def change_password(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        if not user.check_password(serializer.validated_data['old_password']):
            return Response({'error': 'Incorrect current password.'}, status=400)
        user.set_password(serializer.validated_data['new_password'])
        user.save()
        return Response({'detail': 'Password changed successfully.'})

    @action(detail=False, methods=['get'], url_path='agents')
    def agents(self, request):
        dept_id = request.query_params.get('department')
        qs = User.objects.filter(is_active=True).select_related('role')
        if dept_id:
            qs = qs.filter(department_id=dept_id)
        agent_or_above = [u for u in qs if u.is_admin or u.has_perm_key('tickets', 'claim')]
        return Response(UserMinimalSerializer(agent_or_above, many=True).data)

    @action(detail=False, methods=['get'], url_path='mentionable', permission_classes=[IsAuthenticated])
    def mentionable(self, request):
        """
        Returns users for the @mention dropdown, grouped as:
          - dept_users: active users in the ticket's department (shown first)
          - other_users: all other active users who have a department assigned
        Excludes the current requester and assignee (passed as query params).
        """
        ticket_dept_id = request.query_params.get('department')
        exclude_ids = [int(x) for x in request.query_params.getlist('exclude') if x.isdigit()]
        exclude_ids.append(request.user.id)

        base = User.objects.filter(is_active=True).exclude(id__in=exclude_ids).select_related('department', 'role')

        if ticket_dept_id:
            dept_users = base.filter(department_id=ticket_dept_id)
            other_users = base.filter(department__isnull=False).exclude(department_id=ticket_dept_id)
        else:
            dept_users = User.objects.none()
            other_users = base.filter(department__isnull=False)

        def serialize(qs):
            return [
                {
                    'id': u.id,
                    'full_name': u.full_name,
                    'email': u.email,
                    'role': u.role.name,
                    'department_name': u.department.name if u.department else None,
                    'avatar': u.avatar.url if u.avatar else None,
                }
                for u in qs
            ]

        return Response({
            'dept_users': serialize(dept_users),
            'other_users': serialize(other_users),
        })

    @action(detail=False, methods=['get'], url_path='template')
    def template(self, request):
        headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Role', 'Department', 'Password', 'Active']
        role_names = ', '.join(Role.objects.order_by('name').values_list('name', flat=True)) or '(none defined yet)'
        dept_names = ', '.join(
            Department.objects.filter(is_active=True).order_by('name').values_list('name', flat=True)
        ) or '(none defined yet)'
        notes = [
            'Master upload template for Users.',
            'Fill in one row per user below the header row.',
            'Email is the matching key: uploading a row with an email that already belongs to a user skips '
            'that row - this import only creates new users, it never modifies existing ones.',
            f'Role must exactly match an existing role name: {role_names}',
            f'Department must exactly match an existing department name: {dept_names}',
            'Password is optional. Leave blank to create the account without a usable password (they can use '
            '"Forgot password" to set one).',
            'Active must be YES or NO. Leave blank to default to YES.',
            'Role and Department are required for every new user.',
        ]
        return build_template('users_template.xlsx', headers, notes=notes)

    @action(detail=False, methods=['post'], url_path='import')
    def import_excel(self, request):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'file is required.'}, status=400)

        try:
            headers, rows = read_upload(file_obj)
        except BadUpload as e:
            return Response({'error': str(e)}, status=400)
        for required in ('First Name', 'Last Name', 'Email'):
            if required not in headers:
                return Response(
                    {'error': f'Missing required column "{required}". Re-download the template and try again.'},
                    status=400,
                )

        roles_by_name = {r.name.lower(): r for r in Role.objects.all()}
        depts_by_name = {d.name.lower(): d for d in Department.objects.all()}

        # Redact the Password column before it can ever end up in the
        # downloadable error report - that report may get saved/shared, and
        # a bulk-upload sheet's Password column is plaintext.
        pw_idx = headers.index('Password') if 'Password' in headers else None

        def _redacted(row):
            if pw_idx is None or not row[pw_idx]:
                return row
            row = list(row)
            row[pw_idx] = '••••••••'
            return row

        created = skipped = 0
        created_rows, skipped_rows, errors = [], [], []
        for i, row in enumerate(rows, start=2):
            email = row_cell(headers, row, 'Email')
            first_name = row_cell(headers, row, 'First Name')
            last_name = row_cell(headers, row, 'Last Name')
            if not email and not first_name and not last_name:
                continue
            if not email or not first_name or not last_name:
                errors.append({'row': i, 'error': 'First Name, Last Name and Email are all required.', 'data': _redacted(row)})
                continue

            # Create-only import: a row matching an existing user (by email)
            # is skipped, never used to modify that user.
            if User.objects.filter(email__iexact=email).exists():
                skipped += 1
                skipped_rows.append({'row': i, 'data': _redacted(row)})
                continue

            role_name = row_cell(headers, row, 'Role')
            dept_name = row_cell(headers, row, 'Department')
            role = roles_by_name.get(role_name.lower()) if role_name else None
            if role_name and not role:
                errors.append({'row': i, 'error': f'Unknown role "{role_name}".', 'data': _redacted(row)})
                continue
            department = depts_by_name.get(dept_name.lower()) if dept_name else None
            if dept_name and not department:
                errors.append({'row': i, 'error': f'Unknown department "{dept_name}".', 'data': _redacted(row)})
                continue
            if not role:
                errors.append({'row': i, 'error': 'Role is required for new users.', 'data': _redacted(row)})
                continue
            if not department:
                errors.append({'row': i, 'error': 'Department is required for new users.', 'data': _redacted(row)})
                continue

            active_raw = row_cell(headers, row, 'Active').lower()
            is_active = active_raw not in ('no', 'false', '0')
            password = row_cell(headers, row, 'Password')

            try:
                if password:
                    validate_password(password)

                user = User(
                    email=email, first_name=first_name, last_name=last_name,
                    phone=row_cell(headers, row, 'Phone'), role=role, department=department,
                    is_active=is_active,
                )
                if password:
                    user.set_password(password)
                else:
                    user.set_unusable_password()
                user.save()
                created += 1
                created_rows.append({'row': i, 'data': _redacted(row)})
            except DjangoValidationError as e:
                errors.append({'row': i, 'error': '; '.join(e.messages), 'data': _redacted(row)})
            except Exception as e:
                errors.append({'row': i, 'error': str(e), 'data': _redacted(row)})

        result = {'created': created, 'skipped': skipped, 'errors': errors}
        if created_rows or skipped_rows or errors:
            result['import_report_base64'] = build_import_report_base64(headers, created_rows, skipped_rows, errors)
            result['import_report_filename'] = 'users_import_report.xlsx'
        return Response(result)


class RoleViewSet(viewsets.ModelViewSet):
    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    pagination_class = None

    def get_permissions(self):
        if self.action == 'create':
            return [require_perm('roles', 'add')()]
        if self.action in ['update', 'partial_update']:
            return [require_perm('roles', 'edit')()]
        if self.action == 'destroy':
            return [require_perm('roles', 'delete')()]
        return [require_perm('roles', 'view')()]

    def perform_destroy(self, instance):
        from django.db.models import ProtectedError
        from rest_framework.exceptions import ValidationError

        if instance.is_super and not Role.objects.filter(is_super=True).exclude(pk=instance.pk).exists():
            raise ValidationError(
                'At least one role must remain a super role, or you could lock everyone out of Settings.'
            )
        try:
            instance.delete()
        except ProtectedError:
            raise ValidationError('This role still has users assigned - reassign them to another role first.')


class PermissionCatalogView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(permission_catalog())
