from django.urls import path
from .views import SystemSettingsView, TestEmailView, FullBackupView

urlpatterns = [
    path('', SystemSettingsView.as_view(), name='system-settings'),
    path('test-email/', TestEmailView.as_view(), name='test-email'),
    path('full-backup/', FullBackupView.as_view(), name='full-backup'),
]
