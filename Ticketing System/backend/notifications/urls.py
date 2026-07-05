from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import NotificationViewSet, EmailTemplateViewSet

router = DefaultRouter()
# Must come before the '' NotificationViewSet registration below - that
# viewset's detail route uses an unrestricted pk lookup, so "email-templates"
# would otherwise be swallowed as a notification pk.
router.register('email-templates', EmailTemplateViewSet, basename='email-template')
router.register('', NotificationViewSet, basename='notification')

urlpatterns = [path('', include(router.urls))]
