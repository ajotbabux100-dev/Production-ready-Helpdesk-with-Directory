from rest_framework import viewsets
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend

from .models import AuditLog
from .serializers import AuditLogSerializer
from users.permissions import require_perm


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AuditLogSerializer
    permission_classes = [require_perm('audit', 'view')]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['action', 'user', 'ticket']
    search_fields = ['description', 'user__email']
    ordering_fields = ['timestamp']

    def get_queryset(self):
        qs = AuditLog.objects.select_related('user', 'ticket').all()
        exclude = self.request.query_params.get('exclude_actions')
        if exclude:
            qs = qs.exclude(action__in=[a.strip() for a in exclude.split(',')])
        return qs
