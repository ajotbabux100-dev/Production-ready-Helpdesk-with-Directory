from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from .models import DirectoryTab, DirectoryField, StaffDirectoryEntry, Portal, PortalCategory
from .serializers import (
    DirectoryTabSerializer, DirectoryFieldSerializer, StaffDirectoryEntrySerializer,
    PortalSerializer, PortalCategorySerializer,
)
from users.permissions import require_perm
from excel_io import build_template, read_upload, build_import_report_base64, BadUpload
from excel_io.core import row_cell


class DirectoryTabViewSet(viewsets.ModelViewSet):
    queryset = DirectoryTab.objects.prefetch_related('fields').all()
    serializer_class = DirectoryTabSerializer

    def get_permissions(self):
        if self.action == 'create':
            return [require_perm('directory_tabs', 'add')()]
        if self.action in ['update', 'partial_update']:
            return [require_perm('directory_tabs', 'edit')()]
        if self.action == 'destroy':
            return [require_perm('directory_tabs', 'delete')()]
        return [require_perm('directory_tabs', 'view')()]

    def perform_create(self, serializer):
        # Give new tabs a starter "Name" field so they're usable right away -
        # it's a normal DirectoryField, so it can be renamed or deleted freely.
        tab = serializer.save()
        DirectoryField.objects.create(tab=tab, name='Name', order=0)


class DirectoryFieldViewSet(viewsets.ModelViewSet):
    queryset = DirectoryField.objects.all()
    serializer_class = DirectoryFieldSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['tab']

    def get_permissions(self):
        if self.action == 'create':
            return [require_perm('directory_tabs', 'add')()]
        if self.action in ['update', 'partial_update']:
            return [require_perm('directory_tabs', 'edit')()]
        if self.action == 'destroy':
            return [require_perm('directory_tabs', 'delete')()]
        return [require_perm('directory_tabs', 'view')()]

    def perform_destroy(self, instance):
        field_id = str(instance.id)
        for entry in instance.tab.entries.all():
            if field_id in entry.values:
                del entry.values[field_id]
                entry.save(update_fields=['values'])
        instance.delete()


class StaffDirectoryEntryViewSet(viewsets.ModelViewSet):
    queryset = StaffDirectoryEntry.objects.select_related('tab').all()
    serializer_class = StaffDirectoryEntrySerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['tab']
    # The frontend renders this as a single flat table with no page-through
    # controls (unlike Tickets, which does), so it needs the whole tab's
    # entries in one response - the default 20-per-page cap was silently
    # hiding everything past the first page.
    pagination_class = None

    def get_permissions(self):
        if self.action in ['create', 'import_excel']:
            return [require_perm('directory_tabs', 'add')()]
        if self.action in ['update', 'partial_update']:
            return [require_perm('directory_tabs', 'edit')()]
        if self.action == 'destroy':
            return [require_perm('directory_tabs', 'delete')()]
        return [require_perm('directory_tabs', 'view')()]

    @action(detail=False, methods=['get'], url_path='template')
    def template(self, request):
        tab_id = request.query_params.get('tab')
        if not tab_id:
            return Response({'error': 'tab query param is required.'}, status=400)
        tab = get_object_or_404(DirectoryTab, pk=tab_id)
        fields = list(tab.fields.order_by('order', 'id'))
        if not fields:
            return Response({'error': 'This tab has no fields defined yet - add some from Settings first.'}, status=400)
        headers = [f.name for f in fields]
        notes = [
            f'Master upload template for the directory tab "{tab.name}".',
            'Fill in one row per entry below the header row. Do not rename, reorder or remove the header columns.',
            f'"{headers[0]}" is used as the matching key: if a row\'s "{headers[0]}" value matches an existing '
            'entry exactly, that row is skipped - this import only creates new entries, it never modifies '
            'existing ones.',
            'Leave a cell blank to leave that detail empty.',
        ]
        return build_template(f'directory_{tab.name}_template.xlsx', headers, notes=notes)

    @action(detail=False, methods=['post'], url_path='import')
    def import_excel(self, request):
        tab_id = request.data.get('tab')
        file_obj = request.FILES.get('file')
        if not tab_id or not file_obj:
            return Response({'error': 'tab and file are required.'}, status=400)
        tab = get_object_or_404(DirectoryTab, pk=tab_id)
        fields = list(tab.fields.order_by('order', 'id'))
        if not fields:
            return Response({'error': 'This tab has no fields defined yet - add some from Settings first.'}, status=400)
        field_by_name = {f.name: f for f in fields}

        try:
            headers, rows = read_upload(file_obj)
        except BadUpload as e:
            return Response({'error': str(e)}, status=400)
        unknown = [h for h in headers if h and h not in field_by_name]
        if unknown:
            return Response(
                {'error': f'Unknown column(s): {", ".join(unknown)}. Re-download the template and try again.'},
                status=400,
            )

        key_field = fields[0]
        existing_by_key = {}
        for entry in tab.entries.all():
            key_val = str(entry.values.get(str(key_field.id), '')).strip()
            if key_val:
                existing_by_key[key_val] = entry

        created = skipped = 0
        created_rows, skipped_rows, errors = [], [], []
        for i, row in enumerate(rows, start=2):
            row_values = {}
            for h in headers:
                if not h:
                    continue
                f = field_by_name[h]
                row_values[str(f.id)] = row_cell(headers, row, h)
            if not any(v for v in row_values.values()):
                continue
            key_val = row_values.get(str(key_field.id), '').strip()
            try:
                # Create-only import: a row matching an existing entry is
                # skipped, never used to modify that entry.
                existing = existing_by_key.get(key_val) if key_val else None
                if existing:
                    skipped += 1
                    skipped_rows.append({'row': i, 'data': row})
                else:
                    entry = StaffDirectoryEntry.objects.create(tab=tab, values=row_values)
                    if key_val:
                        existing_by_key[key_val] = entry
                    created += 1
                    created_rows.append({'row': i, 'data': row})
            except Exception as e:
                errors.append({'row': i, 'error': str(e), 'data': row})

        result = {'created': created, 'skipped': skipped, 'errors': errors}
        if created_rows or skipped_rows or errors:
            result['import_report_base64'] = build_import_report_base64(headers, created_rows, skipped_rows, errors)
            result['import_report_filename'] = f'{tab.name}_import_report.xlsx'
        return Response(result)


class PortalCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = PortalCategorySerializer
    pagination_class = None

    def get_permissions(self):
        if self.action == 'create':
            return [require_perm('portal_categories', 'add')()]
        if self.action in ['update', 'partial_update']:
            return [require_perm('portal_categories', 'edit')()]
        if self.action == 'destroy':
            return [require_perm('portal_categories', 'delete')()]
        return [require_perm('portal_categories', 'view')()]

    def get_queryset(self):
        qs = PortalCategory.objects.all()
        user = self.request.user
        # Admins manage categories, so they always see the full list (including
        # restricted ones) even though their role may not be in the allow-list.
        if user.is_admin:
            return qs
        return qs.filter(Q(allowed_roles__isnull=True) | Q(allowed_roles=user.role)).distinct()


class PortalViewSet(viewsets.ModelViewSet):
    serializer_class = PortalSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['category']
    pagination_class = None

    def get_permissions(self):
        if self.action in ['create', 'import_excel']:
            return [require_perm('directory_portals', 'add')()]
        if self.action in ['update', 'partial_update']:
            return [require_perm('directory_portals', 'edit')()]
        if self.action == 'destroy':
            return [require_perm('directory_portals', 'delete')()]
        return [require_perm('directory_portals', 'view')()]

    def get_queryset(self):
        qs = Portal.objects.select_related('category').all()
        user = self.request.user
        if user.is_admin:
            return qs
        return qs.filter(
            Q(category__isnull=True) | Q(category__allowed_roles__isnull=True) | Q(category__allowed_roles=user.role)
        ).distinct()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=['get'], url_path='template')
    def template(self, request):
        headers = ['Name', 'URL', 'Category']
        notes = [
            'Master upload template for Portals.',
            'Fill in one row per portal link below the header row.',
            'URL must start with http:// or https://',
            'Category is optional. If the category name does not exist yet, it will be created automatically.',
            '"Name" is used as the matching key: if a row\'s Name matches an existing portal exactly, that '
            'row is skipped - this import only creates new portals, it never modifies existing ones.',
        ]
        sample_rows = [['Company Intranet', 'https://intranet.example.com', 'Internal Tools']]
        return build_template('portals_template.xlsx', headers, notes=notes, sample_rows=sample_rows)

    @action(detail=False, methods=['post'], url_path='import')
    def import_excel(self, request):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'file is required.'}, status=400)

        try:
            headers, rows = read_upload(file_obj)
        except BadUpload as e:
            return Response({'error': str(e)}, status=400)
        for required in ('Name', 'URL'):
            if required not in headers:
                return Response(
                    {'error': f'Missing required column "{required}". Re-download the template and try again.'},
                    status=400,
                )

        created = skipped = 0
        created_rows, skipped_rows, errors = [], [], []
        for i, row in enumerate(rows, start=2):
            name = row_cell(headers, row, 'Name')
            url = row_cell(headers, row, 'URL')
            category_name = row_cell(headers, row, 'Category')
            if not name and not url:
                continue
            if not name:
                errors.append({'row': i, 'error': 'Name is required.', 'data': row})
                continue
            if not (url.startswith('http://') or url.startswith('https://')):
                errors.append({'row': i, 'error': 'URL must start with http:// or https://', 'data': row})
                continue

            try:
                # Create-only import: a row matching an existing portal
                # (by name) is skipped, never used to modify that portal.
                if Portal.objects.filter(name=name).exists():
                    skipped += 1
                    skipped_rows.append({'row': i, 'data': row})
                else:
                    category = None
                    if category_name:
                        category, _ = PortalCategory.objects.get_or_create(name=category_name)
                    Portal.objects.create(name=name, url=url, category=category, created_by=request.user)
                    created += 1
                    created_rows.append({'row': i, 'data': row})
            except Exception as e:
                errors.append({'row': i, 'error': str(e), 'data': row})

        result = {'created': created, 'skipped': skipped, 'errors': errors}
        if created_rows or skipped_rows or errors:
            result['import_report_base64'] = build_import_report_base64(headers, created_rows, skipped_rows, errors)
            result['import_report_filename'] = 'portals_import_report.xlsx'
        return Response(result)
