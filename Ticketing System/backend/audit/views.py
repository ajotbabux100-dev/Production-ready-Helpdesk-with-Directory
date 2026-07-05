from django.utils import timezone
from rest_framework import viewsets
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend

from .models import AuditLog
from .serializers import AuditLogSerializer
from users.permissions import require_perm
from audit.utils import log_action
from excel_io.core import build_workbook


def _filtered_queryset(request):
    """Same filtering AuditLogViewSet.get_queryset() applies, plus an
    optional ?start_date=/?end_date= (YYYY-MM-DD) range - shared by the
    list view, the export, and the export-and-delete action so "what you
    see is what gets backed up / deleted" always holds."""
    qs = AuditLog.objects.select_related('user', 'ticket').all()
    exclude = request.query_params.get('exclude_actions')
    if exclude:
        qs = qs.exclude(action__in=[a.strip() for a in exclude.split(',')])
    action = request.query_params.get('action')
    if action:
        qs = qs.filter(action=action)
    # Plural/comma-list sibling of ?action= - e.g. ?actions=login,logout for
    # a combined login-history view in one paginated query, instead of two
    # separate exact-match requests merged client-side.
    actions = request.query_params.get('actions')
    if actions:
        qs = qs.filter(action__in=[a.strip() for a in actions.split(',')])
    start_date = request.query_params.get('start_date')
    if start_date:
        qs = qs.filter(timestamp__date__gte=start_date)
    end_date = request.query_params.get('end_date')
    if end_date:
        qs = qs.filter(timestamp__date__lte=end_date)
    return qs


def _export_rows(qs):
    def fmt(dt):
        return timezone.localtime(dt).strftime('%Y-%m-%d %H:%M:%S') if dt else ''
    return [
        [
            fmt(a.timestamp),
            a.user.full_name if a.user else 'System',
            a.get_action_display(),
            a.ticket.ticket_number if a.ticket else '',
            a.description, a.old_value, a.new_value, a.ip_address or '', a.device_display,
        ]
        for a in qs
    ]


_EXPORT_HEADERS = ['Timestamp', 'User', 'Action', 'Ticket', 'Description', 'Old Value', 'New Value', 'IP Address', 'Device']


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AuditLogSerializer
    permission_classes = [require_perm('audit', 'view')]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['action', 'user', 'ticket']
    search_fields = ['description', 'user__email', 'user__first_name', 'user__last_name']
    ordering_fields = ['timestamp']

    def get_queryset(self):
        return _filtered_queryset(self.request)


class AuditLogExportView(APIView):
    """Manual backup - downloads the currently filtered audit log as .xlsx
    without deleting anything."""
    permission_classes = [require_perm('audit', 'export')]

    def get(self, request):
        qs = _filtered_queryset(request).order_by('-timestamp')
        sheets = [('Audit Log', _EXPORT_HEADERS, _export_rows(qs))]
        filename = f'audit_log_backup_{timezone.now().strftime("%Y-%m-%d_%H%M")}.xlsx'
        return build_workbook(filename, sheets)


class AuditLogExportAndDeleteView(APIView):
    """Deletes the currently filtered audit log rows, but the .xlsx backup
    of exactly those rows IS the HTTP response - the browser can only end
    up with a deletion if it also received the matching backup file in the
    same request, so there's no separate "download, then delete" step that
    could be skipped or fail independently."""
    permission_classes = [require_perm('audit', 'delete')]

    def post(self, request):
        qs = _filtered_queryset(request).order_by('-timestamp')
        rows = _export_rows(qs)
        count = len(rows)
        sheets = [('Audit Log', _EXPORT_HEADERS, rows)]
        filename = f'audit_log_backup_before_delete_{timezone.now().strftime("%Y-%m-%d_%H%M")}.xlsx'
        response = build_workbook(filename, sheets)

        qs.delete()
        log_action(
            request.user, AuditLog.AUDIT_LOG_PURGED,
            description=f'Purged {count} audit log entries (backed up to {filename} first)',
            request=request,
        )
        return response
