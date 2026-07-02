from urllib.parse import urlparse

from rest_framework import serializers
from .models import DirectoryTab, DirectoryField, StaffDirectoryEntry, Portal, PortalCategory


class DirectoryFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = DirectoryField
        fields = ['id', 'tab', 'name', 'order', 'created_at']
        read_only_fields = ['created_at']


class DirectoryTabSerializer(serializers.ModelSerializer):
    entry_count = serializers.SerializerMethodField()
    custom_fields = DirectoryFieldSerializer(source='fields', many=True, read_only=True)

    class Meta:
        model = DirectoryTab
        fields = ['id', 'name', 'order', 'custom_fields', 'entry_count', 'created_at']
        read_only_fields = ['created_at']

    def get_entry_count(self, obj):
        return obj.entries.count()


class StaffDirectoryEntrySerializer(serializers.ModelSerializer):
    tab_name = serializers.CharField(source='tab.name', read_only=True)

    class Meta:
        model = StaffDirectoryEntry
        fields = ['id', 'tab', 'tab_name', 'values', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']

    def validate_values(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('values must be an object keyed by field id.')
        cleaned = {str(k): ('' if v is None else str(v)) for k, v in value.items()}
        if not any(v.strip() for v in cleaned.values()):
            raise serializers.ValidationError('Fill in at least one detail.')
        return cleaned


class PortalCategorySerializer(serializers.ModelSerializer):
    portal_count = serializers.SerializerMethodField()
    allowed_role_names = serializers.SerializerMethodField()

    class Meta:
        model = PortalCategory
        fields = ['id', 'name', 'order', 'allowed_roles', 'allowed_role_names', 'portal_count', 'created_at']
        read_only_fields = ['created_at']

    def get_portal_count(self, obj):
        return obj.portals.count()

    def get_allowed_role_names(self, obj):
        return [r.name for r in obj.allowed_roles.all()]


class PortalSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    favicon_url = serializers.SerializerMethodField()

    class Meta:
        model = Portal
        fields = [
            'id', 'name', 'url', 'category', 'category_name', 'favicon_url',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_by', 'created_at', 'updated_at']

    def get_favicon_url(self, obj):
        domain = urlparse(obj.url).netloc
        if not domain:
            return None
        return f'https://www.google.com/s2/favicons?domain={domain}&sz=64'
