from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Count, Avg, Q
from django.db.models.functions import TruncMonth, TruncDate
from django.utils import timezone
from datetime import timedelta, datetime

from tickets.models import Ticket
from users.models import User
from departments.models import Department
from users.permissions import require_perm
from excel_io import build_workbook


def _sla_breached_count(qs):
    """DB-side count of tickets whose SLA resolution deadline has passed and
    aren't yet resolved/closed - mirrors Ticket.is_sla_resolution_breached
    without materializing every row into Python just to evaluate a property
    per ticket (matters once a department has thousands of tickets)."""
    return qs.filter(
        sla_resolution_due__isnull=False,
        sla_resolution_due__lt=timezone.now(),
    ).exclude(status__in=[Ticket.RESOLVED, Ticket.CLOSED]).count()


def _dept_scoped(qs, request):
    """Shared department-scoping rule used by every report (including the
    export, which returns row-level ticket detail, not just aggregates).
    Non-admins are ALWAYS pinned to their own department - ?department= is
    only ever honored for an admin/is_super user. Previously a non-admin's
    own ?department=<other id> was trusted outright, letting any manager
    pull another department's tickets by naming its id; a non-admin with no
    department at all also fell through to the unfiltered queryset (every
    department) instead of getting nothing."""
    if request.user.is_admin:
        dept_id = request.query_params.get('department')
        if dept_id:
            return qs.filter(department_id=dept_id)
        return qs
    if request.user.department_id:
        return qs.filter(department=request.user.department_id)
    return qs.none()


def _month_bounds(month_str):
    """Parses a 'YYYY-MM' string into (start, end) timezone-aware datetime
    bounds covering that whole calendar month. Returns None if invalid/blank."""
    if not month_str:
        return None
    try:
        year, month = (int(x) for x in month_str.split('-'))
        start = timezone.make_aware(datetime(year, month, 1))
    except (ValueError, TypeError):
        return None
    end = timezone.make_aware(datetime(year + 1, 1, 1)) if month == 12 else timezone.make_aware(datetime(year, month + 1, 1))
    return start, end


def _month_scoped(qs, request):
    """Restricts a queryset to tickets created within ?month=YYYY-MM, when
    given. Reports with no month filter remain all-time, as before."""
    bounds = _month_bounds(request.query_params.get('month'))
    if not bounds:
        return qs
    start, end = bounds
    return qs.filter(created_at__gte=start, created_at__lt=end)


def _scoped(qs, request):
    return _month_scoped(_dept_scoped(qs, request), request)


class DashboardSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        base_qs = Ticket.objects.all()

        if not (user.is_admin or user.has_perm_key('tickets', 'manage_escalated')):
            base_qs = base_qs.filter(requester=user)
        elif not user.is_admin and user.department:
            base_qs = base_qs.filter(department=user.department)

        summary = {
            'total': base_qs.count(),
            'new': base_qs.filter(status='new').count(),
            'open': base_qs.filter(status__in=['assigned', 'in_progress', 'escalated']).count(),
            'pending': base_qs.filter(status__in=['pending_user', 'pending_vendor']).count(),
            'resolved': base_qs.filter(status='resolved').count(),
            'closed': base_qs.filter(status='closed').count(),
            'sla_breached': _sla_breached_count(base_qs),
        }

        if user.is_admin or user.has_perm_key('tickets', 'claim'):
            summary['assigned_to_me'] = Ticket.objects.filter(
                assigned_to=user,
                status__in=['assigned', 'in_progress']
            ).count()

        return Response(summary)


class TicketsByStatusView(APIView):
    permission_classes = [require_perm('reports', 'view')]

    def get(self, request):
        qs = _scoped(Ticket.objects.all(), request)
        data = qs.values('status').annotate(count=Count('id')).order_by('status')
        return Response(list(data))


class TicketsByPriorityView(APIView):
    permission_classes = [require_perm('reports', 'view')]

    def get(self, request):
        qs = _scoped(Ticket.objects.all(), request)
        data = qs.values('priority').annotate(count=Count('id'))
        return Response(list(data))


class TicketsByDepartmentView(APIView):
    permission_classes = [require_perm('reports', 'view')]

    def get(self, request):
        qs = _month_scoped(Ticket.objects.all(), request)
        data = (
            qs.values('department__name')
            .annotate(total=Count('id'),
                      open=Count('id', filter=Q(status__in=['new', 'assigned', 'in_progress'])),
                      resolved=Count('id', filter=Q(status__in=['resolved', 'closed'])))
            .order_by('-total')
        )
        return Response(list(data))


class TicketTrendView(APIView):
    permission_classes = [require_perm('reports', 'view')]

    def get(self, request):
        bounds = _month_bounds(request.query_params.get('month'))
        if bounds:
            start, end = bounds
            qs = Ticket.objects.filter(created_at__gte=start, created_at__lt=end)
        else:
            days = int(request.query_params.get('days', 30))
            since = timezone.now() - timedelta(days=days)
            qs = Ticket.objects.filter(created_at__gte=since)
        qs = _dept_scoped(qs, request)

        data = (
            qs.annotate(date=TruncDate('created_at'))
            .values('date')
            .annotate(count=Count('id'))
            .order_by('date')
        )
        return Response(list(data))


class AgentPerformanceView(APIView):
    permission_classes = [require_perm('reports', 'view')]

    def get(self, request):
        qs = _scoped(Ticket.objects.filter(assigned_to__isnull=False), request)
        data = (
            qs.values('assigned_to__first_name', 'assigned_to__last_name', 'assigned_to__email')
            .annotate(
                total=Count('id'),
                resolved=Count('id', filter=Q(status__in=['resolved', 'closed'])),
            )
            .order_by('-resolved')
        )
        return Response(list(data))


class SLAComplianceView(APIView):
    permission_classes = [require_perm('reports', 'view')]

    def get(self, request):
        qs = _scoped(Ticket.objects.filter(sla_resolution_due__isnull=False), request)
        total = qs.count()
        breached = _sla_breached_count(qs)
        compliant = total - breached
        rate = round((compliant / total * 100), 1) if total else 0

        return Response({
            'total': total,
            'compliant': compliant,
            'breached': breached,
            'compliance_rate': rate,
        })


ORDERING_FIELDS = {
    'created_at': 'created_at',
    '-created_at': '-created_at',
    'ticket_number': 'ticket_number',
    '-ticket_number': '-ticket_number',
    'priority': 'priority',
    '-priority': '-priority',
    'status': 'status',
    '-status': '-status',
}


class ReportsExportView(APIView):
    """Bundles the same aggregated data behind every report widget on the
    Reports page into one downloadable multi-sheet .xlsx, respecting the
    same ?department=/?month= scoping (and ?ordering= for the ticket-level
    sheet) as the on-screen reports, so "download" always matches what's
    currently being viewed."""
    permission_classes = [require_perm('reports', 'view')]

    def get(self, request):
        status_rows = _scoped(Ticket.objects.all(), request).values('status').annotate(count=Count('id')).order_by('status')
        priority_rows = _scoped(Ticket.objects.all(), request).values('priority').annotate(count=Count('id')).order_by('priority')

        dept_rows = (
            _month_scoped(Ticket.objects.all(), request)
            .values('department__name')
            .annotate(total=Count('id'),
                      open=Count('id', filter=Q(status__in=['new', 'assigned', 'in_progress'])),
                      resolved=Count('id', filter=Q(status__in=['resolved', 'closed'])))
            .order_by('-total')
        )

        month_param = request.query_params.get('month')
        bounds = _month_bounds(month_param)
        if bounds:
            start, end = bounds
            trend_qs = _dept_scoped(Ticket.objects.filter(created_at__gte=start, created_at__lt=end), request)
            trend_label = f'Ticket Trend ({month_param})'
        else:
            days = int(request.query_params.get('days', 30))
            since = timezone.now() - timedelta(days=days)
            trend_qs = _dept_scoped(Ticket.objects.filter(created_at__gte=since), request)
            trend_label = f'Ticket Trend ({days}d)'
        trend_rows = (
            trend_qs.annotate(date=TruncDate('created_at'))
            .values('date').annotate(count=Count('id')).order_by('date')
        )

        agent_rows = (
            _scoped(Ticket.objects.filter(assigned_to__isnull=False), request)
            .values('assigned_to__first_name', 'assigned_to__last_name', 'assigned_to__email')
            .annotate(total=Count('id'), resolved=Count('id', filter=Q(status__in=['resolved', 'closed'])))
            .order_by('-resolved')
        )

        sla_qs = _scoped(Ticket.objects.filter(sla_resolution_due__isnull=False), request)
        sla_total = sla_qs.count()
        sla_breached = _sla_breached_count(sla_qs)
        sla_compliant = sla_total - sla_breached
        sla_rate = round((sla_compliant / sla_total * 100), 1) if sla_total else 0

        def fmt(dt):
            return timezone.localtime(dt).strftime('%Y-%m-%d %H:%M') if dt else ''

        ordering = ORDERING_FIELDS.get(request.query_params.get('ordering'), '-created_at')
        tickets_qs = _scoped(
            Ticket.objects.select_related('requester', 'department', 'assigned_to').all(), request
        ).order_by(ordering)
        ticket_rows = [
            [
                t.ticket_number, t.title, t.get_status_display(), t.get_priority_display(),
                t.category, t.department.name if t.department else '',
                t.requester.full_name if t.requester else '',
                t.assigned_to.full_name if t.assigned_to else 'Unassigned',
                fmt(t.created_at), fmt(t.resolved_at), fmt(t.sla_resolution_due),
                'Yes' if t.is_sla_resolution_breached else 'No', t.location,
            ]
            for t in tickets_qs
        ]

        sheets = [
            ('Ticket Details', [
                'Ticket Number', 'Title', 'Status', 'Priority', 'Category', 'Department',
                'Requester', 'Assigned To', 'Created', 'Resolved', 'SLA Due', 'SLA Breached', 'Location',
            ], ticket_rows),
            ('Tickets by Status', ['Status', 'Count'], [[r['status'], r['count']] for r in status_rows]),
            ('Tickets by Priority', ['Priority', 'Count'], [[r['priority'], r['count']] for r in priority_rows]),
            ('Tickets by Department', ['Department', 'Total', 'Open', 'Resolved'],
             [[r['department__name'] or 'Unassigned', r['total'], r['open'], r['resolved']] for r in dept_rows]),
            (trend_label, ['Date', 'Count'], [[r['date'], r['count']] for r in trend_rows]),
            ('Agent Performance', ['Agent', 'Email', 'Total Assigned', 'Resolved'],
             [[f"{r['assigned_to__first_name']} {r['assigned_to__last_name']}".strip(),
               r['assigned_to__email'], r['total'], r['resolved']] for r in agent_rows]),
            ('SLA Compliance', ['Total', 'Compliant', 'Breached', 'Compliance Rate %'],
             [[sla_total, sla_compliant, sla_breached, sla_rate]]),
        ]

        suffix = month_param if bounds else timezone.now().strftime('%Y-%m-%d')
        filename = f'reports_{suffix}.xlsx'
        return build_workbook(filename, sheets)
