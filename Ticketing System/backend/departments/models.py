from django.db import models


class Department(models.Model):
    name = models.CharField(max_length=200, unique=True)
    description = models.TextField(blank=True)
    email = models.EmailField(blank=True, help_text='Department email for notifications')
    manager = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='managed_departments',
    )
    auto_assign_to = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='auto_assigned_departments',
        help_text='Auto-assign new tickets in this department to this person',
    )
    ROUTE_MANAGER = 'manager'
    ROUTE_POOL = 'pool'
    ROUTING_CHOICES = [
        (ROUTE_MANAGER, 'Manager Assignment'),
        (ROUTE_POOL, 'Department Pool'),
    ]
    routing_mode = models.CharField(
        max_length=20,
        choices=ROUTING_CHOICES,
        default=ROUTE_MANAGER,
        help_text=(
            'Manager Assignment: manager assigns each ticket to a specific agent. '
            'Department Pool: all department members see new tickets and any one of them can claim and resolve it.'
        ),
    )

    MENTION_DEPT = 'department'
    MENTION_ALL = 'all'
    MENTION_SCOPE_CHOICES = [
        (MENTION_DEPT, 'Department Only'),
        (MENTION_ALL, 'All Users'),
    ]
    mention_scope = models.CharField(
        max_length=20,
        choices=MENTION_SCOPE_CHOICES,
        default=MENTION_ALL,
        help_text='Controls who can be @mentioned in ticket comments for this department.',
    )

    is_active = models.BooleanField(default=True)
    is_deleted = models.BooleanField(default=False)
    deleted_alias = models.CharField(max_length=50, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class SLAPolicy(models.Model):
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

    department = models.ForeignKey(
        Department,
        on_delete=models.CASCADE,
        related_name='sla_policies',
        null=True,
        blank=True,
        help_text='Leave blank for global default',
    )
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES)
    response_time_minutes = models.PositiveIntegerField(help_text='Minutes to first response')
    resolution_time_minutes = models.PositiveIntegerField(help_text='Minutes to resolution')

    class Meta:
        unique_together = ('department', 'priority')
        ordering = ['priority']

    def __str__(self):
        dept = self.department.name if self.department else 'Global'
        return f'{dept} - {self.get_priority_display()}'

    @property
    def response_time_display(self):
        mins = self.response_time_minutes
        if mins < 60:
            return f'{mins} min'
        return f'{mins // 60} hr' if mins % 60 == 0 else f'{mins // 60} hr {mins % 60} min'

    @property
    def resolution_time_display(self):
        mins = self.resolution_time_minutes
        if mins < 60:
            return f'{mins} min'
        hours = mins // 60
        if hours < 24:
            return f'{hours} hr' if mins % 60 == 0 else f'{hours} hr {mins % 60} min'
        days = hours // 24
        return f'{days} day' if hours % 24 == 0 else f'{days} day {hours % 24} hr'
