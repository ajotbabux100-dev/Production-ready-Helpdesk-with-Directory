from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    DirectoryTabViewSet, DirectoryFieldViewSet, StaffDirectoryEntryViewSet,
    PortalViewSet, PortalCategoryViewSet,
)

router = DefaultRouter()
router.register('tabs', DirectoryTabViewSet, basename='directory-tab')
router.register('fields', DirectoryFieldViewSet, basename='directory-field')
router.register('entries', StaffDirectoryEntryViewSet, basename='directory-entry')
router.register('portal-categories', PortalCategoryViewSet, basename='portal-category')
router.register('portals', PortalViewSet, basename='portal')

urlpatterns = [path('', include(router.urls))]
