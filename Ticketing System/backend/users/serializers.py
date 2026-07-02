from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from .models import User, Role
from .rbac import ALL_PERMISSION_KEYS


class RoleSerializer(serializers.ModelSerializer):
    user_count = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = ['id', 'name', 'is_super', 'permissions', 'user_count', 'created_at']
        read_only_fields = ['created_at']

    def get_user_count(self, obj):
        return obj.users.count()

    def validate_permissions(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('permissions must be a list of "module.action" strings.')
        unknown = set(value) - ALL_PERMISSION_KEYS
        if unknown:
            raise serializers.ValidationError(f'Unknown permission keys: {", ".join(sorted(unknown))}')
        return value

    def validate(self, attrs):
        # Determine what is_super would be after this save, and block it if
        # that would leave zero is_super roles in the system.
        making_super = attrs.get('is_super', self.instance.is_super if self.instance else False)
        if not making_super:
            other_supers = Role.objects.filter(is_super=True)
            if self.instance:
                other_supers = other_supers.exclude(pk=self.instance.pk)
            if not other_supers.exists():
                raise serializers.ValidationError(
                    'At least one role must remain a super role, or you could lock everyone out of Settings.'
                )
        return attrs


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    department_name = serializers.CharField(source='department.name', read_only=True)
    password = serializers.CharField(write_only=True, required=False)
    role_detail = RoleSerializer(source='role', read_only=True)
    assignable_roles_detail = RoleSerializer(source='assignable_roles', many=True, read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name', 'full_name',
            'phone', 'role', 'role_detail', 'assignable_roles', 'assignable_roles_detail',
            'department', 'department_name',
            'avatar', 'is_active', 'is_deleted', 'deleted_alias',
            'date_joined', 'password',
        ]
        read_only_fields = ['id', 'date_joined', 'is_deleted', 'deleted_alias']

    def validate_department(self, value):
        if value is None:
            raise serializers.ValidationError('Department is required.')
        return value

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        assignable_roles = validated_data.pop('assignable_roles', None)
        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        if assignable_roles is not None:
            user.assignable_roles.set(assignable_roles)
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        assignable_roles = validated_data.pop('assignable_roles', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        if assignable_roles is not None:
            instance.assignable_roles.set(assignable_roles)
        return instance


class UserMinimalSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    role = serializers.CharField(source='role.name', read_only=True)

    class Meta:
        model = User
        fields = ['id', 'email', 'full_name', 'avatar', 'role', 'department']


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True)

    def validate_new_password(self, value):
        validate_password(value)
        return value


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(min_length=6, max_length=6)
    new_password = serializers.CharField(required=True)

    def validate_new_password(self, value):
        validate_password(value)
        return value
