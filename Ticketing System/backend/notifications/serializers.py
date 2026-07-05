from rest_framework import serializers
from .models import (
    Notification, EmailTemplate,
    EMAIL_TEMPLATE_DEFAULTS, EMAIL_TEMPLATE_PLACEHOLDERS, EMAIL_TEMPLATE_EXTRA_PLACEHOLDERS,
)


class EmailTemplateSerializer(serializers.ModelSerializer):
    label = serializers.SerializerMethodField()
    default_subject = serializers.SerializerMethodField()
    default_body = serializers.SerializerMethodField()
    placeholders = serializers.SerializerMethodField()

    class Meta:
        model = EmailTemplate
        fields = [
            'id', 'notification_type', 'label', 'is_custom', 'subject', 'body',
            'default_subject', 'default_body', 'placeholders', 'updated_at',
        ]
        read_only_fields = ['id', 'notification_type', 'updated_at']

    def get_label(self, obj):
        return EMAIL_TEMPLATE_DEFAULTS[obj.notification_type]['label']

    def get_default_subject(self, obj):
        return EMAIL_TEMPLATE_DEFAULTS[obj.notification_type]['subject']

    def get_default_body(self, obj):
        return EMAIL_TEMPLATE_DEFAULTS[obj.notification_type]['body']

    def get_placeholders(self, obj):
        return EMAIL_TEMPLATE_PLACEHOLDERS + EMAIL_TEMPLATE_EXTRA_PLACEHOLDERS.get(obj.notification_type, [])


class NotificationSerializer(serializers.ModelSerializer):
    ticket_number = serializers.CharField(source='ticket.ticket_number', read_only=True)
    notification_type_display = serializers.CharField(source='get_notification_type_display', read_only=True)

    class Meta:
        model = Notification
        fields = [
            'id', 'ticket', 'ticket_number', 'notification_type',
            'notification_type_display', 'title', 'message',
            'is_read', 'created_at',
        ]
        read_only_fields = ['created_at']
