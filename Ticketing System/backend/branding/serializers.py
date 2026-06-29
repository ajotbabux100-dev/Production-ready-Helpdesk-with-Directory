from rest_framework import serializers
from .models import SystemSettings

MASK = '••••••••'


class SystemSettingsSerializer(serializers.ModelSerializer):
    ticket_number_preview = serializers.ReadOnlyField()
    company_logo_url = serializers.SerializerMethodField()
    favicon_url = serializers.SerializerMethodField()
    # Return masked password so the frontend knows one is set without exposing it
    email_host_password = serializers.SerializerMethodField()
    # Separate write-only field for updating the password
    email_host_password_write = serializers.CharField(
        write_only=True, required=False, allow_blank=True,
        source='email_host_password',
    )

    class Meta:
        model = SystemSettings
        exclude = ['_ticket_counter', '_ticket_counter_year']
        read_only_fields = ['id']

    def get_company_logo_url(self, obj):
        if obj.company_logo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.company_logo.url)
            return obj.company_logo.url
        return None

    def get_favicon_url(self, obj):
        if obj.favicon:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.favicon.url)
            return obj.favicon.url
        return None

    def get_email_host_password(self, obj):
        return MASK if obj.email_host_password else ''

    def update(self, instance, validated_data):
        # If the submitted password is the mask placeholder, discard it (keep existing)
        pwd = validated_data.get('email_host_password')
        if pwd == MASK:
            validated_data.pop('email_host_password')
        return super().update(instance, validated_data)
