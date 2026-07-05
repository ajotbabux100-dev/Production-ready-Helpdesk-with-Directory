from django.db import models

# Deliberately not a full UA-parsing dependency - this only needs to produce
# a friendly "Browser on OS" label for the login history views, not handle
# every device on earth. Order matters: check more specific tokens (Edg,
# OPR) before the generic ones they also contain (Chrome, Safari).
_OS_PATTERNS = [
    ('Windows', 'Windows'),
    # iOS UAs also contain "like Mac OS X" - must check these before the
    # plain Mac OS X pattern below or every iPhone/iPad reports as macOS.
    ('iPhone', 'iOS'),
    ('iPad', 'iPadOS'),
    ('Mac OS X', 'macOS'),
    ('Android', 'Android'),
    ('Linux', 'Linux'),
]
_BROWSER_PATTERNS = [
    ('Edg/', 'Edge'),
    ('OPR/', 'Opera'),
    ('Chrome/', 'Chrome'),
    ('Firefox/', 'Firefox'),
    ('Safari/', 'Safari'),
]


def describe_user_agent(user_agent):
    """Turns a raw User-Agent header into a short 'Browser on OS' label,
    e.g. 'Chrome on Windows'. Returns 'Unknown device' if ua is blank or
    unrecognized."""
    if not user_agent:
        return 'Unknown device'
    os_name = next((label for token, label in _OS_PATTERNS if token in user_agent), 'Unknown OS')
    browser = next((label for token, label in _BROWSER_PATTERNS if token in user_agent), 'Unknown browser')
    return f'{browser} on {os_name}'


class AuditLog(models.Model):
    TICKET_CREATED = 'ticket_created'
    TICKET_UPDATED = 'ticket_updated'
    TICKET_ASSIGNED = 'ticket_assigned'
    TICKET_REASSIGNED = 'ticket_reassigned'
    STATUS_CHANGED = 'status_changed'
    PRIORITY_CHANGED = 'priority_changed'
    COMMENT_ADDED = 'comment_added'
    ATTACHMENT_ADDED = 'attachment_added'
    TICKET_RESOLVED = 'ticket_resolved'
    TICKET_CLOSED = 'ticket_closed'
    TICKET_REOPENED = 'ticket_reopened'
    USER_CREATED = 'user_created'
    USER_UPDATED = 'user_updated'
    USER_DEACTIVATED = 'user_deactivated'
    DEPARTMENT_CREATED = 'department_created'
    DEPARTMENT_UPDATED = 'department_updated'
    LOGIN = 'login'
    LOGOUT = 'logout'
    VAULT_REVEALED = 'vault_revealed'
    PASSWORD_RESET_REQUESTED = 'password_reset_requested'
    PASSWORD_RESET_COMPLETED = 'password_reset_completed'
    ROLE_SWITCHED = 'role_switched'
    AUDIT_LOG_PURGED = 'audit_log_purged'

    ACTION_CHOICES = [
        (TICKET_CREATED, 'Ticket Created'),
        (TICKET_UPDATED, 'Ticket Updated'),
        (TICKET_ASSIGNED, 'Ticket Assigned'),
        (TICKET_REASSIGNED, 'Ticket Reassigned'),
        (STATUS_CHANGED, 'Status Changed'),
        (PRIORITY_CHANGED, 'Priority Changed'),
        (COMMENT_ADDED, 'Comment Added'),
        (ATTACHMENT_ADDED, 'Attachment Added'),
        (TICKET_RESOLVED, 'Ticket Resolved'),
        (TICKET_CLOSED, 'Ticket Closed'),
        (TICKET_REOPENED, 'Ticket Reopened'),
        (USER_CREATED, 'User Created'),
        (USER_UPDATED, 'User Updated'),
        (USER_DEACTIVATED, 'User Deactivated'),
        (DEPARTMENT_CREATED, 'Department Created'),
        (DEPARTMENT_UPDATED, 'Department Updated'),
        (LOGIN, 'User Login'),
        (LOGOUT, 'User Logout'),
        (VAULT_REVEALED, 'Vault Password Revealed'),
        (PASSWORD_RESET_REQUESTED, 'Password Reset Requested'),
        (PASSWORD_RESET_COMPLETED, 'Password Reset Completed'),
        (ROLE_SWITCHED, 'Active Role Switched'),
        (AUDIT_LOG_PURGED, 'Audit Log Purged'),
    ]

    user = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs',
    )
    action = models.CharField(max_length=50, choices=ACTION_CHOICES)
    ticket = models.ForeignKey(
        'tickets.Ticket',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs',
    )
    description = models.TextField()
    old_value = models.TextField(blank=True)
    new_value = models.TextField(blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=300, blank=True, help_text='Raw User-Agent header, for device/browser display.')
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']

    @property
    def device_display(self):
        return describe_user_agent(self.user_agent)

    def __str__(self):
        return f'{self.action} by {self.user} at {self.timestamp}'
