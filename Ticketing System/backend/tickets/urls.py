from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    TicketViewSet, TicketFormConfigView, TicketCategoryViewSet,
    AttachmentDownloadView, CommentAttachmentDownloadView,
)

router = DefaultRouter()
router.register('categories', TicketCategoryViewSet, basename='ticket-category')
router.register('', TicketViewSet, basename='ticket')

urlpatterns = [
    path('form-config/', TicketFormConfigView.as_view(), name='ticket-form-config'),
    # Must come before the router include below - TicketViewSet's detail
    # route uses an unrestricted pk lookup, so "attachments" would otherwise
    # be swallowed as a ticket pk if this were registered after it.
    path('attachments/<int:pk>/download/', AttachmentDownloadView.as_view(), name='attachment-download'),
    path('comment-attachments/<int:pk>/download/', CommentAttachmentDownloadView.as_view(), name='comment-attachment-download'),
    path('', include(router.urls)),
]
