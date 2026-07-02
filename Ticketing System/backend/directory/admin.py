from django.contrib import admin
from .models import DirectoryTab, DirectoryField, StaffDirectoryEntry, Portal, PortalCategory

admin.site.register(DirectoryTab)
admin.site.register(DirectoryField)
admin.site.register(StaffDirectoryEntry)
admin.site.register(PortalCategory)
admin.site.register(Portal)
