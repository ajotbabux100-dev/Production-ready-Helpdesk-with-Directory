from django.db import models


class DirectoryTab(models.Model):
    """Admin-defined grouping for directory entries (e.g. "Head Office",
    "Warehouse Extensions", or anything else) - no organization-specific
    names are hardcoded; the admin creates and names as many as they need."""
    name = models.CharField(max_length=100, unique=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'name']

    def __str__(self):
        return self.name


class DirectoryField(models.Model):
    """A custom column defined per-tab (e.g. "Extension", "Room No",
    "Notes" - or anything else). Admins add/rename/remove these freely;
    nothing is hardcoded, so each tab can have its own set of details."""
    tab = models.ForeignKey(DirectoryTab, on_delete=models.CASCADE, related_name='fields')
    name = models.CharField(max_length=100)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'id']
        unique_together = ('tab', 'name')

    def __str__(self):
        return f'{self.tab.name} / {self.name}'


class StaffDirectoryEntry(models.Model):
    """A generic contact record. Every detail - including what shows up as
    a "Name" column - is stored in `values`, keyed by the tab's
    DirectoryField ids. There's no hardcoded field at all: a new tab gets a
    default "Name" field for convenience, but it's a regular DirectoryField
    that can be renamed or deleted just like any other."""
    tab = models.ForeignKey(
        DirectoryTab,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='entries',
    )
    values = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        first_value = next(iter(self.values.values()), None)
        return first_value or f'Entry #{self.pk}'


class PortalCategory(models.Model):
    name = models.CharField(max_length=100, unique=True)
    order = models.PositiveIntegerField(default=0)
    # Empty = visible to everyone. Non-empty = only users holding one of these
    # roles (plus is_super roles) can see it.
    allowed_roles = models.ManyToManyField(
        'users.Role',
        blank=True,
        related_name='allowed_portal_categories',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'name']
        verbose_name_plural = 'Portal categories'

    def __str__(self):
        return self.name


class Portal(models.Model):
    name = models.CharField(max_length=200)
    url = models.URLField()
    category = models.ForeignKey(
        PortalCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='portals',
    )
    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_portals',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name
