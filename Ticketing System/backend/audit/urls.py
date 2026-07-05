from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AuditLogViewSet, AuditLogExportView, AuditLogExportAndDeleteView

router = DefaultRouter()
router.register('', AuditLogViewSet, basename='audit')

urlpatterns = [
    # Must come before the '' AuditLogViewSet include below - its detail
    # route uses an unrestricted pk lookup, so these would otherwise be
    # swallowed as an audit log pk.
    path('export/', AuditLogExportView.as_view(), name='audit-export'),
    path('export-and-delete/', AuditLogExportAndDeleteView.as_view(), name='audit-export-and-delete'),
    path('', include(router.urls)),
]
