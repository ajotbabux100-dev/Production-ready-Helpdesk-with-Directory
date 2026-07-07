import logging
import string

from django.core.mail import EmailMultiAlternatives, get_connection
from django.template.loader import render_to_string
from django.utils.html import escape
from django.utils.safestring import mark_safe

logger = logging.getLogger(__name__)


class _SafeDict(dict):
    """Missing placeholders render as '' instead of raising KeyError - an
    admin's custom template may reference a placeholder that isn't relevant
    to every call site (e.g. {escalated_by} outside the escalation email)."""
    def __missing__(self, key):
        return ''


def _fmt_datetime(dt):
    # Django's date formatting (not raw strftime) since '%-d'/'%-I' aren't
    # portable across platforms (Windows lacks them entirely). localtime()
    # first to match the auto-localization the `|date:` template filter does
    # for the same field elsewhere (e.g. ticket_assigned.html).
    if not dt:
        return ''
    from django.utils import timezone
    from django.utils.dateformat import format as django_date_format
    return django_date_format(timezone.localtime(dt), 'N j, Y g:i A')


def _placeholder_context(ticket):
    """Common {placeholder} values available to every customizable email -
    see EMAIL_TEMPLATE_PLACEHOLDERS/EMAIL_TEMPLATE_EXTRA_PLACEHOLDERS in
    models.py, which document this same list for the Settings UI. Date
    fields are '' when not set/applicable - an admin only sees them in an
    email if they chose to insert the tag into their own custom text."""
    return {
        'ticket_number': ticket.ticket_number,
        'title': ticket.title,
        'description': ticket.description,
        'category': _category_display(ticket),
        'priority': ticket.get_priority_display(),
        'status': ticket.get_status_display(),
        'department': ticket.department.name if ticket.department else '',
        'location': ticket.location or '',
        'requester_name': ticket.requester.full_name,
        'requester_email': ticket.requester.email,
        'assigned_to_name': ticket.assigned_to.full_name if ticket.assigned_to else 'Unassigned',
        'portal_name': _portal_name(),
        'ticket_url': f'{_frontend_url()}/tickets/{ticket.id}',
        'response_due': _fmt_datetime(ticket.sla_response_due),
        'resolution_due': _fmt_datetime(ticket.sla_resolution_due),
        'created_at': _fmt_datetime(ticket.created_at),
        'resolved_at': _fmt_datetime(ticket.resolved_at),
    }


def _portal_name():
    from branding.models import SystemSettings
    return SystemSettings.get().portal_name


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

    ticket = context.get('ticket')
    custom = None
    if ticket is not None:
        from .models import EmailTemplate
        custom = EmailTemplate.objects.filter(notification_type=template_name, is_custom=True).first()

    if custom and custom.subject and custom.body:
        placeholders = _SafeDict(_placeholder_context(ticket))
        # Extra string values already in this call's context (e.g.
        # escalated_by, escalation_reason for the escalation email) become
        # placeholders too, on top of the common ticket fields above.
        for key, value in context.items():
            if key not in ('ticket', '_plain_text') and isinstance(value, str):
                placeholders[key] = value

        fmt = string.Formatter()
        subject = fmt.vformat(custom.subject, (), placeholders)
        plain = fmt.vformat(custom.body, (), placeholders)
        html_message = render_to_string('emails/custom_email.html', {
            'body_html': mark_safe(escape(plain).replace('\n', '<br>')),
            'ticket_url': placeholders['ticket_url'],
            'settings': s,
            'frontend_url': _frontend_url(),
        })
    else:
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


def _send_whatsapp(flag_name, recipient, message):
    """Best-effort WhatsApp send alongside the email/in-app notification for
    the same event - mirrors _notify_enabled's flag lookup but against the
    separate whatsapp_notify_on_* flags, and silently no-ops if the
    recipient has no phone number on file or WhatsApp isn't configured."""
    if not recipient or not getattr(recipient, 'phone', ''):
        return
    from branding.models import SystemSettings
    s = SystemSettings.get()
    if not s.whatsapp_enabled or not getattr(s, flag_name, False):
        return
    from .whatsapp import send_whatsapp_message
    send_whatsapp_message(recipient.phone, message)


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


def _category_display(ticket):
    # Ticket.category is a plain slug string (no Django `choices`), so there's
    # no auto-generated get_category_display() - resolve it the same way
    # TicketListSerializer/TicketDetailSerializer do, or templates would just
    # silently render this field blank.
    from tickets.models import TicketCategory
    if not ticket.category:
        return ''
    cat = TicketCategory.objects.filter(slug=ticket.category).first()
    return cat.name if cat else ticket.category.replace('_', ' ').title()


def notify_ticket_created(ticket):
    if not _notify_enabled('notify_on_ticket_created'):
        return

    title = f'Ticket {ticket.ticket_number} received'
    message = f'Your ticket "{ticket.title}" has been received and is being reviewed.'
    _push(ticket.requester, ticket, 'ticket_created', title, message)
    _send_whatsapp('whatsapp_notify_on_ticket_created', ticket.requester, message)

    ctx = {
        'ticket': ticket,
        'category_display': _category_display(ticket),
        '_plain_text': f'Your ticket {ticket.ticket_number} has been received.',
    }
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

    # Pool routing with no specific assignee: the ticket only being visible
    # in a shared queue isn't enough - without this, nobody gets a personal
    # heads-up and it can sit unnoticed. Notify every eligible department
    # member individually, same as a direct assignment would.
    dept = ticket.department
    if dept and dept.routing_mode == 'pool' and not ticket.assigned_to_id:
        from users.models import User
        members = (
            User.objects.filter(department=dept, is_active=True)
            .exclude(id=ticket.requester_id)
            .select_related('role')
        )
        pool_title = f'New ticket available: {ticket.ticket_number}'
        pool_message = f'"{ticket.title}" was submitted to {dept.name} and is open for anyone to claim.'
        for member in members:
            if not (member.is_admin or member.has_perm_key('tickets', 'claim')):
                continue
            _push(member, ticket, 'ticket_assigned', pool_title, pool_message)
            _send_whatsapp('whatsapp_notify_on_ticket_assigned', member, pool_message)
            send_ticket_email(
                f'[{ticket.ticket_number}] New ticket available in {dept.name}',
                member.email,
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
    _send_whatsapp('whatsapp_notify_on_ticket_assigned', ticket.assigned_to, message)

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
    _send_whatsapp('whatsapp_notify_on_status_updated', ticket.requester, message)

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
    _send_whatsapp('whatsapp_notify_on_comment_added', ticket.requester, message)

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
    _send_whatsapp('whatsapp_notify_on_ticket_resolved', ticket.requester, message)

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
        _send_whatsapp('whatsapp_notify_on_sla_breach', ticket.assigned_to, message)

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
