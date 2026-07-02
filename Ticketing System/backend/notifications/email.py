import logging

from django.core.mail import EmailMultiAlternatives, get_connection
from django.template.loader import render_to_string

logger = logging.getLogger(__name__)


def _get_smtp_connection():
    """Returns an SMTP connection built from SystemSettings, or None if email is disabled."""
    from branding.models import SystemSettings
    s = SystemSettings.get()
    if not s.email_enabled or not s.email_host or not s.email_host_user or not s.email_host_password:
        return None, s
    conn = get_connection(
        backend='django.core.mail.backends.smtp.EmailBackend',
        host=s.email_host,
        port=s.email_port,
        username=s.email_host_user,
        password=s.email_host_password,
        use_tls=s.email_use_tls,
        use_ssl=s.email_use_ssl,
        timeout=s.email_timeout or 30,
        fail_silently=False,
    )
    return conn, s


def send_ticket_email(subject, recipient_email, template_name, context):
    conn, s = _get_smtp_connection()
    if conn is None:
        logger.info('Email not sent to %s: SMTP is disabled or not fully configured.', recipient_email)
        return False

    from_email = f'{s.email_sender_name} <{s.email_sender_address or s.email_host_user}>'
    reply_to = [s.email_reply_to] if s.email_reply_to else []

    context.setdefault('settings', s)
    context.setdefault('frontend_url', _frontend_url())

    try:
        html_message = render_to_string(f'emails/{template_name}.html', context)
    except Exception:
        html_message = None

    plain = context.get('_plain_text', '')

    try:
        msg = EmailMultiAlternatives(
            subject=subject,
            body=plain,
            from_email=from_email,
            to=[recipient_email],
            reply_to=reply_to,
            connection=conn,
        )
        if html_message:
            msg.attach_alternative(html_message, 'text/html')
        msg.send()
        return True
    except Exception:
        logger.exception('Email error sending to %s', recipient_email)
        return False


def _frontend_url():
    from django.conf import settings as dj_settings
    return getattr(dj_settings, 'FRONTEND_URL', 'http://localhost:3000')


def _notify_enabled(flag_name):
    from branding.models import SystemSettings
    s = SystemSettings.get()
    return getattr(s, flag_name, True)


def _push(recipient, ticket, notification_type, title, message):
    """Create an in-app Notification record for the given recipient."""
    from .models import Notification
    try:
        Notification.objects.create(
            recipient=recipient,
            ticket=ticket,
            notification_type=notification_type,
            title=title,
            message=message,
        )
    except Exception:
        logger.exception('In-app notification error for recipient %s', recipient)


def notify_ticket_created(ticket):
    if not _notify_enabled('notify_on_ticket_created'):
        return

    title = f'Ticket {ticket.ticket_number} received'
    message = f'Your ticket "{ticket.title}" has been received and is being reviewed.'
    _push(ticket.requester, ticket, 'ticket_created', title, message)

    ctx = {'ticket': ticket, '_plain_text': f'Your ticket {ticket.ticket_number} has been received.'}
    send_ticket_email(
        f'[{ticket.ticket_number}] Your ticket has been received',
        ticket.requester.email,
        'ticket_created',
        ctx,
    )
    if ticket.department and ticket.department.email:
        send_ticket_email(
            f'[{ticket.ticket_number}] New ticket assigned to your department',
            ticket.department.email,
            'ticket_dept_notification',
            {**ctx},
        )


def notify_ticket_assigned(ticket):
    if not _notify_enabled('notify_on_ticket_assigned'):
        return
    if not ticket.assigned_to:
        return

    title = f'Ticket {ticket.ticket_number} assigned to you'
    message = f'"{ticket.title}" has been assigned to you. Priority: {ticket.get_priority_display()}.'
    _push(ticket.assigned_to, ticket, 'ticket_assigned', title, message)

    ctx = {'ticket': ticket, '_plain_text': f'Ticket {ticket.ticket_number} has been assigned to you.'}
    send_ticket_email(
        f'[{ticket.ticket_number}] Ticket assigned to you',
        ticket.assigned_to.email,
        'ticket_assigned',
        ctx,
    )


def notify_status_updated(ticket):
    if not _notify_enabled('notify_on_status_updated'):
        return

    title = f'Ticket {ticket.ticket_number} status updated'
    message = f'Your ticket "{ticket.title}" status changed to {ticket.get_status_display()}.'
    _push(ticket.requester, ticket, 'status_updated', title, message)

    ctx = {'ticket': ticket, '_plain_text': f'Ticket {ticket.ticket_number} status updated to {ticket.get_status_display()}.'}
    send_ticket_email(
        f'[{ticket.ticket_number}] Status updated to {ticket.get_status_display()}',
        ticket.requester.email,
        'status_updated',
        ctx,
    )


def notify_comment_added(ticket):
    if not _notify_enabled('notify_on_comment_added'):
        return

    title = f'New reply on ticket {ticket.ticket_number}'
    message = f'A new update has been posted on your ticket "{ticket.title}".'
    _push(ticket.requester, ticket, 'comment_added', title, message)

    ctx = {'ticket': ticket, '_plain_text': f'A new update has been posted on ticket {ticket.ticket_number}.'}
    send_ticket_email(
        f'[{ticket.ticket_number}] New update on your ticket',
        ticket.requester.email,
        'comment_added',
        ctx,
    )


def notify_ticket_resolved(ticket):
    if not _notify_enabled('notify_on_ticket_resolved'):
        return

    title = f'Ticket {ticket.ticket_number} resolved'
    message = f'Your ticket "{ticket.title}" has been resolved.'
    _push(ticket.requester, ticket, 'ticket_resolved', title, message)

    ctx = {'ticket': ticket, '_plain_text': f'Ticket {ticket.ticket_number} has been resolved.'}
    send_ticket_email(
        f'[{ticket.ticket_number}] Your ticket has been resolved',
        ticket.requester.email,
        'ticket_resolved',
        ctx,
    )


def notify_ticket_escalated(ticket, escalated_by, reason=''):
    """Email + in-app notification for the manager who receives the escalated ticket."""
    if not ticket.assigned_to:
        return

    title = f'Ticket {ticket.ticket_number} escalated to you'
    message = (
        f'"{ticket.title}" was escalated to you by {escalated_by}.'
        + (f' Reason: {reason}' if reason else '')
    )
    _push(ticket.assigned_to, ticket, 'ticket_escalated', title, message)

    ctx = {
        'ticket': ticket,
        'escalated_by': escalated_by,
        'escalation_reason': reason,
        '_plain_text': (
            f'Ticket {ticket.ticket_number} has been escalated to you by {escalated_by}.'
            + (f' Reason: {reason}' if reason else '')
        ),
    }
    send_ticket_email(
        f'[{ticket.ticket_number}] ⚠️ Ticket Escalated to You',
        ticket.assigned_to.email,
        'ticket_escalated',
        ctx,
    )


def notify_sla_breach(ticket):
    if not _notify_enabled('notify_on_sla_breach'):
        return

    if ticket.assigned_to:
        title = f'SLA breach — ticket {ticket.ticket_number}'
        message = f'SLA resolution deadline has been breached for ticket "{ticket.title}".'
        _push(ticket.assigned_to, ticket, 'sla_breach', title, message)

        ctx = {'ticket': ticket, '_plain_text': f'SLA breach alert for ticket {ticket.ticket_number}.'}
        send_ticket_email(
            f'[{ticket.ticket_number}] ⚠️ SLA Breach Alert',
            ticket.assigned_to.email,
            'sla_breach',
            ctx,
        )
    if ticket.department and ticket.department.email:
        ctx = {'ticket': ticket, '_plain_text': f'SLA breach alert for ticket {ticket.ticket_number}.'}
        send_ticket_email(
            f'[{ticket.ticket_number}] ⚠️ SLA Breach Alert',
            ticket.department.email,
            'sla_breach',
            {**ctx},
        )
