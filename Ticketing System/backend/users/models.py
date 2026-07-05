from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


class Role(models.Model):
    """An admin-editable role: a name plus a set of permission keys
    ("module.action" strings, see rbac.py). `is_super` bypasses all
    permission checks and all data-scoping (replaces the old hardcoded
    "admin" bypass) - at least one role must always have is_super=True,
    enforced in RoleViewSet."""
    name = models.CharField(max_length=100, unique=True)
    is_super = models.BooleanField(default=False)
    permissions = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    def has_perm(self, module, action):
        if self.is_super:
            return True
        return f'{module}.{action}' in self.permissions


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required')
        email = self.normalize_email(email)
        if 'role' not in extra_fields or extra_fields['role'] is None:
            # Minimal-privilege fallback if no default role exists yet (e.g. pre-migration).
            extra_fields['role'], _ = Role.objects.get_or_create(name='end_user')
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        admin_role, _ = Role.objects.get_or_create(name='admin', defaults={'is_super': True})
        extra_fields.setdefault('role', admin_role)
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    phone = models.CharField(max_length=20, blank=True)
    role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name='users')
    # Extra roles this user is allowed to switch into from their profile,
    # on top of `role` (their current/active role). Switching just repoints
    # `role` at one of these - it deliberately does NOT change how
    # permissions are resolved (still a single active role at a time), so
    # every existing has_perm_key()/is_admin check keeps working unchanged.
    assignable_roles = models.ManyToManyField(
        Role, blank=True, related_name='assignable_users',
    )
    department = models.ForeignKey(
        'departments.Department',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='members',
    )
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)
    idle_timeout_minutes = models.PositiveIntegerField(
        null=True, blank=True,
        help_text='Overrides the system default idle-logout time for this user. '
                   'Leave blank to use the default (Settings -> Portal).',
    )
    # Server-side idle enforcement (IdleAwareJWTAuthentication) - deliberately
    # separate from the frontend's own JS timer, which can't be trusted alone
    # (a frozen/backgrounded tab, disabled JS, or a tampered client would
    # never log out). Only updated by the /auth/heartbeat/ endpoint, which
    # the frontend calls on real activity - NOT on every API request, or
    # routine background polling (e.g. the notification-count poll) would
    # silently keep sessions alive forever regardless of real user activity.
    last_activity_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)
    deleted_alias = models.CharField(max_length=50, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    date_joined = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name']

    class Meta:
        ordering = ['first_name', 'last_name']

    def __str__(self):
        return f'{self.first_name} {self.last_name} ({self.email})'

    @property
    def full_name(self):
        if self.is_deleted:
            return self.deleted_alias or 'Deleted User'
        return f'{self.first_name} {self.last_name}'.strip() or self.email

    @property
    def is_admin(self):
        """"Sees/does everything" bypass - replaces the old hardcoded admin
        role check. Now driven by Role.is_super, so any role can be granted
        (or stripped of) full access via Settings -> Roles."""
        return bool(self.role_id and self.role.is_super)

    def has_perm_key(self, module, action):
        if not self.role_id:
            return False
        return self.role.has_perm(module, action)


class PasswordResetOTP(models.Model):
    """A single-use 6-digit code emailed to the user for the forgot-password
    flow. Deliberately not reused for anything else (e.g. login MFA) - keep
    it scoped to password reset so its short validity/attempt limits stay
    simple to reason about."""
    VALIDITY_MINUTES = 10
    MAX_ATTEMPTS = 5

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reset_otps')
    code = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    attempts = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['-created_at']

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    @property
    def is_valid(self):
        return not self.used_at and not self.is_expired and self.attempts < self.MAX_ATTEMPTS
