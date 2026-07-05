from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Notification, EmailTemplate, EMAIL_TEMPLATE_DEFAULTS
from .serializers import NotificationSerializer, EmailTemplateSerializer
from users.permissions import require_perm


class EmailTemplateViewSet(viewsets.ModelViewSet):
    """Lets an admin customize the subject/body of each system email.
    One row per notification type - list() lazily creates any missing rows
    (seeded with the built-in default text) so the full set of 8 always
    shows up without needing a data migration."""
    serializer_class = EmailTemplateSerializer
    permission_classes = [require_perm('settings', 'edit')]
    lookup_field = 'notification_type'
    http_method_names = ['get', 'patch', 'head', 'options']

    def get_queryset(self):
        existing = set(EmailTemplate.objects.values_list('notification_type', flat=True))
        missing = set(EMAIL_TEMPLATE_DEFAULTS) - existing
        for notification_type in missing:
            defaults = EMAIL_TEMPLATE_DEFAULTS[notification_type]
            EmailTemplate.objects.create(
                notification_type=notification_type,
                subject=defaults['subject'],
                body=defaults['body'],
            )
        return EmailTemplate.objects.all().order_by('notification_type')


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user).select_related('ticket')

    @action(detail=True, methods=['patch'])
    def mark_read(self, request, pk=None):
        notif = self.get_object()
        notif.is_read = True
        notif.save(update_fields=['is_read'])
        return Response({'status': 'marked as read'})

    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        self.get_queryset().filter(is_read=False).update(is_read=True)
        return Response({'status': 'all marked as read'})

    @action(detail=False, methods=['get'])
    def unread_count(self, request):
        count = self.get_queryset().filter(is_read=False).count()
        return Response({'count': count})
