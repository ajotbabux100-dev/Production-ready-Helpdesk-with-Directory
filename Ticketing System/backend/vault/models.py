from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import models


def _fernet():
    return Fernet(settings.VAULT_ENCRYPTION_KEY.encode() if isinstance(settings.VAULT_ENCRYPTION_KEY, str) else settings.VAULT_ENCRYPTION_KEY)


class VaultEntry(models.Model):
    """A single saved credential in a user's private password vault.
    Always scoped to its owner - even is_super roles cannot see another
    user's entries (this is a deliberate exception to the usual RBAC
    is_super bypass, per product decision)."""
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='vault_entries')
    title = models.CharField(max_length=150)
    username = models.CharField(max_length=255)
    url = models.URLField(max_length=500, blank=True)
    comment = models.TextField(blank=True)
    encrypted_password = models.BinaryField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['title']

    def __str__(self):
        return f'{self.title} ({self.owner.email})'

    def set_password(self, raw_password):
        self.encrypted_password = _fernet().encrypt(raw_password.encode())

    def get_password(self):
        try:
            return _fernet().decrypt(bytes(self.encrypted_password)).decode()
        except InvalidToken:
            return ''
