from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import VaultEntryViewSet

router = DefaultRouter()
router.register('entries', VaultEntryViewSet, basename='vault-entry')

urlpatterns = [
    path('', include(router.urls)),
]
