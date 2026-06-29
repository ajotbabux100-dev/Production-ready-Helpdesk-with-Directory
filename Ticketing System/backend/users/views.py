from rest_framework import viewsets, generics
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from .models import User
from .serializers import UserSerializer, UserMinimalSerializer, ChangePasswordSerializer
from audit.utils import log_action
from audit.models import AuditLog


class LoginView(generics.GenericAPIView):
    permission_classes = [AllowAny]

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
        log_action(user, AuditLog.LOGIN, description=f'{user.email} logged in', request=request)
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': UserSerializer(user).data,
        })


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


def _sync_department_manager(user, old_dept_id=None, old_role=None):
    """
    Keep Department.manager in sync with User.role + User.department.
    - If a user's role is 'manager' and they have a department → auto-set as that department's manager.
    - If they moved departments (role still manager) → clear manager link on the old department.
    - If their role changed away from 'manager' → clear manager link on the old department.
    """
    from departments.models import Department
    # Role changed away from manager: clear old dept link if they were the manager
    if old_role == 'manager' and user.role != 'manager' and old_dept_id:
        Department.objects.filter(id=old_dept_id, manager=user).update(manager=None)
        return
    if user.role == 'manager':
        # Moved to a different department: clear manager link on old dept
        if old_dept_id and old_dept_id != user.department_id:
            Department.objects.filter(id=old_dept_id, manager=user).update(manager=None)
        # Set as new department's manager
        if user.department_id:
            Department.objects.filter(id=user.department_id).update(manager=user)


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.select_related('department').all()
    serializer_class = UserSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['role', 'department', 'is_active']
    search_fields = ['email', 'first_name', 'last_name']
    ordering_fields = ['first_name', 'date_joined']

    def get_permissions(self):
        if self.action in ['list', 'create', 'destroy', 'update', 'partial_update']:
            from users.permissions import IsAdminUser
            return [IsAdminUser()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        if user.is_admin:
            return User.objects.select_related('department').filter(is_deleted=False)
        return User.objects.filter(id=user.id, is_deleted=False)

    def perform_destroy(self, instance):
        from django.utils import timezone
        seq = User.objects.filter(is_deleted=True).count() + 1
        alias = f'#name{seq}'
        instance.is_deleted = True
        instance.deleted_alias = alias
        instance.deleted_at = timezone.now()
        instance.first_name = alias
        instance.last_name = ''
        instance.email = f'deleted_name{seq}_{instance.id}@deleted.invalid'
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
        old_role = serializer.instance.role
        user = serializer.save()
        _sync_department_manager(user, old_dept_id=old_dept_id, old_role=old_role)

    @action(detail=False, methods=['get', 'patch'], permission_classes=[IsAuthenticated])
    def me(self, request):
        if request.method == 'GET':
            return Response(UserSerializer(request.user).data)
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

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
        qs = User.objects.filter(role__in=['agent', 'manager', 'admin'], is_active=True)
        if dept_id:
            qs = qs.filter(department_id=dept_id)
        return Response(UserMinimalSerializer(qs, many=True).data)

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

        base = User.objects.filter(is_active=True).exclude(id__in=exclude_ids).select_related('department')

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
                    'role': u.role,
                    'department_name': u.department.name if u.department else None,
                    'avatar': u.avatar.url if u.avatar else None,
                }
                for u in qs
            ]

        return Response({
            'dept_users': serialize(dept_users),
            'other_users': serialize(other_users),
        })
