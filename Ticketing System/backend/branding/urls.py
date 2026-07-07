from django.urls import path
from .views import SystemSettingsView, TestEmailView, TestWhatsAppView, FullBackupView

urlpatterns = [
    path('', SystemSettingsView.as_view(), name='system-settings'),
    path('test-email/', TestEmailView.as_view(), name='test-email'),
    path('test-whatsapp/', TestWhatsAppView.as_view(), name='test-whatsapp'),
    path('full-backup/', FullBackupView.as_view(), name='full-backup'),
]
