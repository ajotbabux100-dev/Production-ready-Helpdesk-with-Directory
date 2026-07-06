from django.db.models import Count, Prefetch, Q
from rest_framework import viewsets
from rest_framework.filters import SearchFilter
from django_filters.rest_framework import DjangoFilterBackend

from .models import Department, SLAPolicy
from .serializers import DepartmentSerializer, DepartmentMinimalSerializer, SLAPolicySerializer
from users.permissions import require_perm
from tickets.models import TicketCategory


class DepartmentViewSet(viewsets.ModelViewSet):
    # member_count/categories are annotated/prefetched here so the serializer
    # doesn't fire a fresh query per department row for every department in
    # the list (was a classic N+1 - harmless with a handful of departments,
    # but scales badly).
    queryset = (
        Department.objects
        .prefetch_related(
            'sla_policies',
            Prefetch('categories', queryset=TicketCategory.objects.filter(is_active=True).order_by('order', 'name')),
        )
        .select_related('manager', 'auto_assign_to')
        .annotate(member_count_annotated=Count('members', filter=Q(members__is_active=True), distinct=True))
        .filter(is_deleted=False)
    )
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ['is_active']
    search_fields = ['name']
    # Frontend renders one flat table with no page-through controls, so it
    # needs every department in one response rather than being silently
    # capped at 20.
    pagination_class = None

    def get_serializer_class(self):
        if self.action == 'list' and not self.request.user.is_admin:
            return DepartmentMinimalSerializer
        return DepartmentSerializer

    def get_permissions(self):
        if self.action == 'create':
            return [require_perm('departments', 'add')()]
        if self.action in ['update', 'partial_update']:
            return [require_perm('departments', 'edit')()]
        if self.action == 'destroy':
            return [require_perm('departments', 'delete')()]
        return [require_perm('departments', 'view')()]

    def perform_destroy(self, instance):
        from django.utils import timezone
        seq = Department.objects.filter(is_deleted=True).count() + 1
        alias = f'#dept{seq}'
        instance.is_deleted = True
        instance.deleted_alias = alias
        instance.deleted_at = timezone.now()
        instance.name = alias
        instance.description = ''
        instance.email = ''
        instance.is_active = False
        instance.manager = None
        instance.auto_assign_to = None
        instance.save()


class SLAPolicyViewSet(viewsets.ModelViewSet):
    queryset = SLAPolicy.objects.select_related('department').all()
    serializer_class = SLAPolicySerializer
    permission_classes = [require_perm('departments', 'edit')]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['department', 'priority']
