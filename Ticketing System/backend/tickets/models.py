from django.db import models
from django.utils import timezone


class TicketCategory(models.Model):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True)
    description = models.CharField(max_length=300, blank=True)
    color = models.CharField(max_length=7, default='#6b7280', help_text='Hex badge colour')
    is_active = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)
    departments = models.ManyToManyField(
        'departments.Department', blank=True,
        related_name='categories',
        help_text='Leave empty to make this category available for all departments.',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'name']
        verbose_name = 'Ticket Category'
        verbose_name_plural = 'Ticket Categories'

    def __str__(self):
        return self.name


class TicketFormConfig(models.Model):
    """Single-row configuration for the ticket submission form.
    Always access via TicketFormConfig.get_config()."""
    category_required = models.BooleanField(default=True)
    priority_required = models.BooleanField(default=False)
    department_required = models.BooleanField(default=True)
    location_required = models.BooleanField(default=False)

    class Meta:
        verbose_name = 'Ticket Form Configuration'

    @classmethod
    def get_config(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return 'Ticket Form Configuration'


def attachment_upload_path(instance, filename):
    return f'attachments/ticket_{instance.ticket.id}/{filename}'


def comment_attachment_path(instance, filename):
    return f'attachments/comment_{instance.comment.id}/{filename}'


class Ticket(models.Model):
    # Status choices
    NEW = 'new'
    ASSIGNED = 'assigned'
    IN_PROGRESS = 'in_progress'
    PENDING_USER = 'pending_user'
    PENDING_VENDOR = 'pending_vendor'
    ESCALATED = 'escalated'
    RESOLVED = 'resolved'
    CLOSED = 'closed'
    REOPENED = 'reopened'

    STATUS_CHOICES = [
        (NEW, 'New'),
        (ASSIGNED, 'Assigned'),
        (IN_PROGRESS, 'In Progress'),
        (PENDING_USER, 'Pending User Response'),
        (PENDING_VENDOR, 'Pending Vendor'),
        (ESCALATED, 'Escalated'),
        (RESOLVED, 'Resolved'),
        (CLOSED, 'Closed'),
        (REOPENED, 'Reopened'),
    ]

    # Priority choices
    CRITICAL = 'critical'
    HIGH = 'high'
    MEDIUM = 'medium'
    LOW = 'low'

    PRIORITY_CHOICES = [
        (CRITICAL, 'Critical'),
        (HIGH, 'High'),
        (MEDIUM, 'Medium'),
        (LOW, 'Low'),
    ]

    ticket_number = models.CharField(max_length=20, unique=True, editable=False)
    title = models.CharField(max_length=300)
    description = models.TextField()
    category = models.CharField(max_length=100, blank=True)
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default=MEDIUM)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=NEW)

    requester = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='submitted_tickets',
    )
    department = models.ForeignKey(
        'departments.Department',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='tickets',
    )
    assigned_to = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_tickets',
    )

    # SLA tracking
    sla_response_due = models.DateTimeField(null=True, blank=True)
    sla_resolution_due = models.DateTimeField(null=True, blank=True)
    first_response_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    location = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.ticket_number}: {self.title}'

    def save(self, *args, **kwargs):
        if not self.ticket_number:
            self.ticket_number = self._generate_ticket_number()
        super().save(*args, **kwargs)

    def _generate_ticket_number(self):
        from branding.models import SystemSettings
        return SystemSettings.get().build_ticket_number()

    @property
    def is_sla_response_breached(self):
        if self.sla_response_due and not self.first_response_at:
            return timezone.now() > self.sla_response_due
        return False

    @property
    def is_sla_resolution_breached(self):
        if self.sla_resolution_due and self.status not in (self.RESOLVED, self.CLOSED):
            return timezone.now() > self.sla_resolution_due
        return False


class Comment(models.Model):
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='comments')
    body = models.TextField()
    is_internal = models.BooleanField(default=False, help_text='Internal notes not visible to requester')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f'Comment by {self.author} on {self.ticket.ticket_number}'


class Attachment(models.Model):
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name='attachments')
    uploaded_by = models.ForeignKey('users.User', on_delete=models.CASCADE)
    file = models.FileField(upload_to=attachment_upload_path)
    filename = models.CharField(max_length=255)
    file_size = models.PositiveIntegerField()
    content_type = models.CharField(max_length=100)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.filename} ({self.ticket.ticket_number})'


class CommentAttachment(models.Model):
    comment = models.ForeignKey(Comment, on_delete=models.CASCADE, related_name='attachments')
    uploaded_by = models.ForeignKey('users.User', on_delete=models.CASCADE)
    file = models.FileField(upload_to=comment_attachment_path)
    filename = models.CharField(max_length=255)
    file_size = models.PositiveIntegerField()
    content_type = models.CharField(max_length=100)
    uploaded_at = models.DateTimeField(auto_now_add=True)


class TicketParticipant(models.Model):
    """Tracks users @mentioned/invited into a ticket as contributors."""
    ACTIVE = 'active'
    CONTRIBUTED = 'contributed'
    EXITED = 'exited'
    STATUS_CHOICES = [
        (ACTIVE, 'Active'),
        (CONTRIBUTED, 'Contributed'),
        (EXITED, 'Exited'),
    ]
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name='participants')
    user = models.ForeignKey(
        'users.User', on_delete=models.CASCADE, related_name='ticket_participations',
    )
    invited_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='sent_invitations',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=ACTIVE)
    invited_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('ticket', 'user')
        ordering = ['invited_at']

    def __str__(self):
        return f'{self.user} on {self.ticket.ticket_number} ({self.status})'
