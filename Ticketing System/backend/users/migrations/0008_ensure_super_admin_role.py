from django.db import migrations

from users.rbac import ALL_PERMISSION_KEYS

SUPER_ADMIN_ROLE_NAME = 'Super Admin'


def ensure_super_admin_role(apps, schema_editor):
    Role = apps.get_model('users', 'Role')

    supers = Role.objects.filter(is_super=True)
    if supers.exists():
        # Already at least one super role - just make sure it's clearly
        # labelled and carries the full permission list (is_super bypasses
        # permission checks either way, but a partial list here would be
        # confusing to read in Settings -> Roles).
        role = supers.filter(name__iexact='admin').first() or supers.first()
        if role.name.lower() == 'admin':
            role.name = SUPER_ADMIN_ROLE_NAME
        role.permissions = sorted(ALL_PERMISSION_KEYS)
        role.save(update_fields=['name', 'permissions'])
        return

    Role.objects.create(
        name=SUPER_ADMIN_ROLE_NAME,
        is_super=True,
        permissions=sorted(ALL_PERMISSION_KEYS),
    )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0007_user_last_activity_at'),
    ]

    operations = [
        migrations.RunPython(ensure_super_admin_role, noop_reverse),
    ]
