import sqlite3

from django.core.management.base import BaseCommand, CommandError

from directory.models import StaffDirectoryEntry, Portal

# (facility, contact_type) -> source table name in the old Flask hospital.db
TELEPHONE_TABLES = {
    'gsh': 'gsh_telephone',
    'gsp': 'gsp_telephone',
}
EMAIL_TABLES = {
    'gsh': 'gsh_email',
    'gsp': 'gsp_email',
}


class Command(BaseCommand):
    help = 'One-time import of the legacy Flask Directory app\'s hospital.db into the directory app.'

    def add_arguments(self, parser):
        parser.add_argument('--path', required=True, help='Path to the legacy hospital.db SQLite file')

    def handle(self, *args, **options):
        path = options['path']
        try:
            src = sqlite3.connect(path)
            src.row_factory = sqlite3.Row
        except sqlite3.Error as exc:
            raise CommandError(f'Could not open {path}: {exc}')

        created_entries = 0
        for facility, table in TELEPHONE_TABLES.items():
            for row in src.execute(f'SELECT name, extn, room_no, location, contact FROM {table}'):
                StaffDirectoryEntry.objects.create(
                    facility=facility,
                    contact_type=StaffDirectoryEntry.TELEPHONE,
                    name=row['name'] or '',
                    extn=row['extn'] or '',
                    room_no=row['room_no'] or '',
                    location=row['location'] or '',
                    contact=row['contact'] or '',
                )
                created_entries += 1

        for facility, table in EMAIL_TABLES.items():
            for row in src.execute(f'SELECT name, email, department FROM {table}'):
                StaffDirectoryEntry.objects.create(
                    facility=facility,
                    contact_type=StaffDirectoryEntry.EMAIL,
                    name=row['name'] or '',
                    email=row['email'] or '',
                    department_label=row['department'] or '',
                )
                created_entries += 1

        created_portals = 0
        for row in src.execute('SELECT name, url FROM portals'):
            Portal.objects.create(name=row['name'] or '', url=row['url'] or '')
            created_portals += 1

        src.close()
        self.stdout.write(self.style.SUCCESS(
            f'Imported {created_entries} directory entries and {created_portals} portals from {path}'
        ))
