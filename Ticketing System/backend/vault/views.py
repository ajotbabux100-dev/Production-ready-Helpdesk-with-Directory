from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.filters import SearchFilter

from .models import VaultEntry
from .serializers import VaultEntrySerializer
from users.permissions import require_perm
from audit.utils import log_action
from audit.models import AuditLog


class VaultEntryViewSet(viewsets.ModelViewSet):
    serializer_class = VaultEntrySerializer
    filter_backends = [SearchFilter]
    search_fields = ['title', 'username', 'url']

    def get_permissions(self):
        # NOTE: overriding get_permissions() means @action(permission_classes=...)
        # kwargs are ignored by DRF - every action (including 'reveal') must be
        # handled explicitly here.
        if self.action == 'create':
            return [require_perm('vault', 'add')()]
        if self.action in ['update', 'partial_update']:
            return [require_perm('vault', 'edit')()]
        if self.action == 'destroy':
            return [require_perm('vault', 'delete')()]
        return [require_perm('vault', 'view')()]

    def get_queryset(self):
        # Always scoped to the requesting user - a private vault, even for
        # is_super roles. Never widen this queryset.
        return VaultEntry.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    @action(detail=True, methods=['post'], throttle_classes=[ScopedRateThrottle])
    def reveal(self, request, pk=None):
        entry = self.get_object()
        account_password = request.data.get('password', '')
        if not account_password or not request.user.check_password(account_password):
            return Response({'error': 'Incorrect account password.'}, status=403)
        log_action(request.user, AuditLog.VAULT_REVEALED,
                   description=f'Revealed vault entry "{entry.title}"', request=request)
        return Response({'password': entry.get_password()})

    def get_throttles(self):
        if self.action == 'reveal':
            self.throttle_scope = 'vault_reveal'
        return super().get_throttles()
