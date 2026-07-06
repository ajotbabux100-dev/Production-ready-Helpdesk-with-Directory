from django.db import models


# Default subject/body text for each customizable email, keyed by the same
# identifier used as the `template_name` passed to send_ticket_email() in
# email.py - that's what ties a custom EmailTemplate row to the right send
# call. Placeholders use {brace} tokens filled in from the ticket at send
# time (see _placeholder_context in email.py).
EMAIL_TEMPLATE_DEFAULTS = {
    'ticket_created': {
        'label': 'Ticket Created (to requester)',
        'subject': '[{ticket_number}] Your ticket has been received',
        'body': (
            'Dear {requester_name},\n\n'
            'Your support ticket has been successfully submitted. Our team will review and respond shortly.\n\n'
            'Ticket Number: {ticket_number}\n'
            'Subject: {title}\n'
            'Category: {category}\n'
            'Priority: {priority}\n'
            'Status: {status}\n'
            'Department: {department}\n'
            'Location: {location}\n'
            'Expected Resolution: {resolution_due}\n\n'
            'Description:\n{description}\n\n'
            'If you need to add more information or attachments, please log in to the portal and update your ticket.'
        ),
    },
    'ticket_dept_notification': {
        'label': 'New Ticket (to department)',
        'subject': '[{ticket_number}] New ticket assigned to your department',
        'body': (
            'A new ticket has been submitted to your department.\n\n'
            'Ticket Number: {ticket_number}\n'
            'Subject: {title}\n'
            'Category: {category}\n'
            'Priority: {priority}\n'
            'Submitted By: {requester_name}\n'
            'Location: {location}\n'
            'Response Due: {response_due}\n\n'
            'Description:\n{description}'
        ),
    },
    'ticket_assigned': {
        'label': 'Ticket Assigned (to agent)',
        'subject': '[{ticket_number}] Ticket assigned to you',
        'body': (
            '"{title}" has been assigned to you.\n\n'
            'Ticket Number: {ticket_number}\n'
            'Priority: {priority}\n'
            'Requester: {requester_name}\n'
            'Response Due: {response_due}\n'
            'Resolution Due: {resolution_due}\n\n'
            'Description:\n{description}'
        ),
    },
    'status_updated': {
        'label': 'Status Updated (to requester)',
        'subject': '[{ticket_number}] Status updated to {status}',
        'body': (
            'Your ticket "{title}" status has changed to {status}.\n\n'
            'Ticket Number: {ticket_number}\n'
            'Handled By: {assigned_to_name}'
        ),
    },
    'comment_added': {
        'label': 'New Reply (to requester)',
        'subject': '[{ticket_number}] New update on your ticket',
        'body': (
            'A new reply has been posted on your ticket "{title}".\n\n'
            'Ticket Number: {ticket_number}\n'
            'Status: {status}'
        ),
    },
    'ticket_resolved': {
        'label': 'Ticket Resolved (to requester)',
        'subject': '[{ticket_number}] Your ticket has been resolved',
        'body': (
            'Your ticket "{title}" has been resolved.\n\n'
            'Ticket Number: {ticket_number}\n'
            'Resolved By: {assigned_to_name}\n'
            'Resolved At: {resolved_at}'
        ),
    },
    'ticket_escalated': {
        'label': 'Ticket Escalated (to manager)',
        'subject': '[{ticket_number}] Ticket Escalated to You',
        'body': (
            '"{title}" was escalated to you by {escalated_by}.\n'
            'Reason: {escalation_reason}\n\n'
            'Ticket Number: {ticket_number}\n'
            'Priority: {priority}\n'
            'Requester: {requester_name}\n'
            'Resolution Due: {resolution_due}'
        ),
    },
    'sla_breach': {
        'label': 'SLA Breach Alert',
        'subject': '[{ticket_number}] SLA Breach Alert',
        'body': (
            'SLA resolution deadline has been breached for ticket "{title}".\n\n'
            'Ticket Number: {ticket_number}\n'
            'Priority: {priority}\n'
            'Status: {status}\n'
            'Department: {department}\n'
            'Assigned To: {assigned_to_name}\n'
            'Created: {created_at}\n'
            'Resolution Due: {resolution_due}'
        ),
    },
}

# Placeholders available to every template, documented for the Settings UI.
# response_due/resolution_due/resolved_at render as '' when not
# applicable/set - admins opt into showing them by inserting the tag into
# their custom text, rather than it being forced by default.
EMAIL_TEMPLATE_PLACEHOLDERS = [
    'ticket_number', 'title', 'description', 'category', 'priority', 'status',
    'department', 'location', 'requester_name', 'requester_email',
    'assigned_to_name', 'portal_name', 'ticket_url', 'created_at',
    'response_due', 'resolution_due',
]
# Extra placeholders only populated for specific notification types.
EMAIL_TEMPLATE_EXTRA_PLACEHOLDERS = {
    'ticket_escalated': ['escalated_by', 'escalation_reason'],
    'ticket_resolved': ['resolved_at'],
}


class EmailTemplate(models.Model):
    TYPE_CHOICES = [(key, val['label']) for key, val in EMAIL_TEMPLATE_DEFAULTS.items()]

    notification_type = models.CharField(max_length=50, choices=TYPE_CHOICES, unique=True)
    is_custom = models.BooleanField(default=False, help_text='If off, the built-in default content is used.')
    subject = models.CharField(max_length=300, blank=True)
    body = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.get_notification_type_display()


class Notification(models.Model):
    TICKET_CREATED = 'ticket_created'
    TICKET_ASSIGNED = 'ticket_assigned'
    STATUS_UPDATED = 'status_updated'
    COMMENT_ADDED = 'comment_added'
    TICKET_RESOLVED = 'ticket_resolved'
    TICKET_CLOSED = 'ticket_closed'
    SLA_BREACH = 'sla_breach'
    TICKET_ESCALATED = 'ticket_escalated'

    TYPE_CHOICES = [
        (TICKET_CREATED, 'Ticket Created'),
        (TICKET_ASSIGNED, 'Ticket Assigned'),
        (STATUS_UPDATED, 'Status Updated'),
        (COMMENT_ADDED, 'Comment Added'),
        (TICKET_RESOLVED, 'Ticket Resolved'),
        (TICKET_CLOSED, 'Ticket Closed'),
        (SLA_BREACH, 'SLA Breach'),
        (TICKET_ESCALATED, 'Ticket Escalated'),
    ]

    recipient = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    ticket = models.ForeignKey(
        'tickets.Ticket',
        on_delete=models.CASCADE,
        related_name='notifications',
        null=True,
        blank=True,
    )
    notification_type = models.CharField(max_length=50, choices=TYPE_CHOICES)
    title = models.CharField(max_length=300)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    email_sent = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.notification_type} for {self.recipient}'
