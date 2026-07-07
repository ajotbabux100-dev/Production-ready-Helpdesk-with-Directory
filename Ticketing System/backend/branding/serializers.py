import json

from rest_framework import serializers
from .models import SystemSettings, LOGIN_HIGHLIGHT_ICONS

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
    # Same masked-read / separate-write pattern as email_host_password above,
    # for the WhatsApp provider secret (Meta permanent token / Twilio Auth Token).
    whatsapp_access_token = serializers.SerializerMethodField()
    whatsapp_access_token_write = serializers.CharField(
        write_only=True, required=False, allow_blank=True,
        source='whatsapp_access_token',
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

    def get_whatsapp_access_token(self, obj):
        return MASK if obj.whatsapp_access_token else ''

    def validate_login_highlights(self, value):
        # The settings form submits as multipart/form-data (to carry the logo
        # file in the same request), which delivers this field as a raw JSON
        # string rather than a parsed list - decode it before validating.
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except (TypeError, ValueError):
                raise serializers.ValidationError('Must be valid JSON: a list of {icon, text} items.')
        if not isinstance(value, list):
            raise serializers.ValidationError('Must be a list of {icon, text} items.')
        for item in value:
            if not isinstance(item, dict) or 'icon' not in item or 'text' not in item:
                raise serializers.ValidationError('Each highlight needs an "icon" and "text".')
            if item['icon'] not in LOGIN_HIGHLIGHT_ICONS:
                raise serializers.ValidationError(f'Unknown icon "{item["icon"]}".')
            if not str(item['text']).strip():
                raise serializers.ValidationError('Highlight text cannot be empty.')
        return value

    def update(self, instance, validated_data):
        # If the submitted password is the mask placeholder, discard it (keep existing)
        pwd = validated_data.get('email_host_password')
        if pwd == MASK:
            validated_data.pop('email_host_password')
        token = validated_data.get('whatsapp_access_token')
        if token == MASK:
            validated_data.pop('whatsapp_access_token')
        return super().update(instance, validated_data)
