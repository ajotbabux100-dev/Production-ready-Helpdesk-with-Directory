"""
Auto-assigns a ticket to the best available agent in its department.
Priority order:
  1. dept.auto_assign_to  (explicitly configured assignee)
  2. dept.manager         (department manager)
  3. Least-busy active agent/manager in the department
"""
from django.db.models import Count, Q


def auto_assign(ticket):
    if not ticket.department_id:
        return

    dept = ticket.department

    # Pool mode: ticket stays unassigned so all department members can see and claim it
    if dept.routing_mode == 'pool':
        return

    def _assign(user):
        ticket.assigned_to = user
        ticket.status = 'assigned'

    def _eligible(user):
        # agent/manager/admin-equivalent: anyone who can claim tickets, or is_super
        return user and user.is_active and (user.is_admin or user.has_perm_key('tickets', 'claim'))

    # 1. Explicitly configured auto-assignee
    if _eligible(dept.auto_assign_to):
        _assign(dept.auto_assign_to)
        return

    # 2. Department manager
    if _eligible(dept.manager):
        _assign(dept.manager)
        return

    # 3. Least-busy agent/manager in the department (admins excluded from
    # load-balancing, same as before - they're only used via 1/2 above).
    from users.models import User
    candidate_ids = [
        u.id for u in User.objects.filter(department=dept, is_active=True).select_related('role')
        if not u.is_admin and u.has_perm_key('tickets', 'claim')
    ]
    agents = (
        User.objects
        .filter(id__in=candidate_ids)
        .annotate(open_count=Count(
            'assigned_tickets',
            filter=Q(assigned_tickets__status__in=('new', 'assigned', 'in_progress', 'escalated'))
        ))
        .order_by('open_count')
    )

    if agents.exists():
        _assign(agents.first())
