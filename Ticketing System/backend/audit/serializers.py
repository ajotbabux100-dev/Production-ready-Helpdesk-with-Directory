from rest_framework import serializers
from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.full_name', read_only=True)
    user_email = serializers.CharField(source='user.email', read_only=True)
    ticket_number = serializers.CharField(source='ticket.ticket_number', read_only=True)
    action_display = serializers.CharField(source='get_action_display', read_only=True)
    device = serializers.CharField(source='device_display', read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            'id', 'user', 'user_name', 'user_email', 'action', 'action_display',
            'ticket', 'ticket_number', 'description',
            'old_value', 'new_value', 'ip_address', 'device', 'timestamp',
        ]
