from rest_framework import serializers
from .models import VaultEntry


class VaultEntrySerializer(serializers.ModelSerializer):
    """Password is write-only and never included in list/retrieve output -
    it can only be retrieved via the reveal action, which re-checks the
    account password first."""
    password = serializers.CharField(write_only=True, required=False)
    has_password = serializers.SerializerMethodField()

    class Meta:
        model = VaultEntry
        fields = ['id', 'title', 'username', 'url', 'comment', 'password', 'has_password', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_has_password(self, obj):
        return bool(obj.encrypted_password)

    def validate_password(self, value):
        if not value:
            raise serializers.ValidationError('Password is required.')
        return value

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        if not password:
            raise serializers.ValidationError({'password': 'Password is required.'})
        entry = VaultEntry(**validated_data)
        entry.set_password(password)
        entry.save()
        return entry

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance
