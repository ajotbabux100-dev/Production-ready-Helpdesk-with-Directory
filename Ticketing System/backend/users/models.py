from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', 'admin')
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    END_USER = 'end_user'
    AGENT = 'agent'
    MANAGER = 'manager'
    ADMIN = 'admin'

    ROLE_CHOICES = [
        (END_USER, 'End User'),
        (AGENT, 'Agent'),
        (MANAGER, 'Manager'),
        (ADMIN, 'Administrator'),
    ]

    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    phone = models.CharField(max_length=20, blank=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=END_USER)
    department = models.ForeignKey(
        'departments.Department',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='members',
    )
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)
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
        return self.role == self.ADMIN

    @property
    def is_manager_or_above(self):
        return self.role in (self.MANAGER, self.ADMIN)

    @property
    def is_agent_or_above(self):
        return self.role in (self.AGENT, self.MANAGER, self.ADMIN)
