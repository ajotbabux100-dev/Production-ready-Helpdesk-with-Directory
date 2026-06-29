"""
Notification tasks — runs synchronously (no Celery required).
Replace with Celery @shared_task if async processing is needed later.
"""
from .email import (
    notify_ticket_created, notify_ticket_assigned,
    notify_status_updated, notify_comment_added,
    notify_ticket_resolved, notify_sla_breach,
    notify_ticket_escalated,
)
from .models import Notification


class _FakeTask:
    """Mimics Celery task .delay() interface for synchronous execution."""
    def __init__(self, fn):
        self._fn = fn

    def delay(self, *args, **kwargs):
        try:
            self._fn(*args, **kwargs)
        except Exception as e:
            print(f'Notification error: {e}')


def _send_notification(event_type, ticket_id):
    from tickets.models import Ticket
    try:
        ticket = Ticket.objects.select_related('requester', 'department', 'assigned_to').get(id=ticket_id)
    except Ticket.DoesNotExist:
        return

    handlers = {
        'ticket_created': notify_ticket_created,
        'ticket_assigned': notify_ticket_assigned,
        'status_updated': notify_status_updated,
        'comment_added': notify_comment_added,
        'ticket_resolved': notify_ticket_resolved,
        'sla_breach': notify_sla_breach,
    }
    handler = handlers.get(event_type)
    if handler:
        handler(ticket)


send_ticket_notification = _FakeTask(_send_notification)
