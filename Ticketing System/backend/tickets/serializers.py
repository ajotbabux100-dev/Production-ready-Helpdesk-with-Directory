from rest_framework import serializers
from .models import Ticket, Comment, Attachment, CommentAttachment, TicketFormConfig, TicketCategory, TicketParticipant
from users.serializers import UserMinimalSerializer
from departments.serializers import DepartmentMinimalSerializer
from departments.models import Department


class TicketCategorySerializer(serializers.ModelSerializer):
    department_ids = serializers.PrimaryKeyRelatedField(
        source='departments',
        many=True,
        queryset=Department.objects.all(),
    )
    department_names = serializers.SerializerMethodField()

    def get_department_names(self, obj):
        return [{'id': d.id, 'name': d.name} for d in obj.departments.all()]

    class Meta:
        model = TicketCategory
        fields = ['id', 'name', 'slug', 'description', 'color', 'is_active', 'order', 'department_ids', 'department_names']


class TicketParticipantSerializer(serializers.ModelSerializer):
    user_detail = UserMinimalSerializer(source='user', read_only=True)
    invited_by_detail = UserMinimalSerializer(source='invited_by', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = TicketParticipant
        fields = ['id', 'user', 'user_detail', 'invited_by', 'invited_by_detail',
                  'status', 'status_display', 'invited_at']
        read_only_fields = ['invited_at']


class TicketFormConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketFormConfig
        fields = ['category_required', 'priority_required', 'department_required', 'location_required']


class AttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Attachment
        fields = ['id', 'file', 'filename', 'file_size', 'content_type', 'uploaded_at', 'uploaded_by']
        read_only_fields = ['uploaded_by', 'uploaded_at']


class CommentAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommentAttachment
        fields = ['id', 'file', 'filename', 'file_size', 'content_type', 'uploaded_at']


class CommentSerializer(serializers.ModelSerializer):
    author_detail = UserMinimalSerializer(source='author', read_only=True)
    attachments = CommentAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Comment
        fields = ['id', 'ticket', 'author', 'author_detail', 'body', 'is_internal', 'attachments', 'created_at', 'updated_at']
        read_only_fields = ['author', 'created_at', 'updated_at']


class TicketListSerializer(serializers.ModelSerializer):
    requester_detail = UserMinimalSerializer(source='requester', read_only=True)
    assigned_to_detail = UserMinimalSerializer(source='assigned_to', read_only=True)
    department_detail = DepartmentMinimalSerializer(source='department', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    category_display = serializers.SerializerMethodField()
    is_sla_response_breached = serializers.ReadOnlyField()
    is_sla_resolution_breached = serializers.ReadOnlyField()

    def get_category_display(self, obj):
        if not obj.category:
            return ''
        cat = TicketCategory.objects.filter(slug=obj.category).first()
        return cat.name if cat else obj.category.replace('_', ' ').title()

    class Meta:
        model = Ticket
        fields = [
            'id', 'ticket_number', 'title', 'category', 'category_display',
            'priority', 'priority_display', 'status', 'status_display',
            'requester', 'requester_detail', 'department', 'department_detail',
            'assigned_to', 'assigned_to_detail',
            'sla_response_due', 'sla_resolution_due',
            'is_sla_response_breached', 'is_sla_resolution_breached',
            'created_at', 'updated_at',
        ]


class TicketDetailSerializer(serializers.ModelSerializer):
    requester_detail = UserMinimalSerializer(source='requester', read_only=True)
    assigned_to_detail = UserMinimalSerializer(source='assigned_to', read_only=True)
    department_detail = DepartmentMinimalSerializer(source='department', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    category_display = serializers.SerializerMethodField()
    comments = CommentSerializer(many=True, read_only=True)
    attachments = AttachmentSerializer(many=True, read_only=True)
    participants = TicketParticipantSerializer(many=True, read_only=True)
    is_sla_response_breached = serializers.ReadOnlyField()
    is_sla_resolution_breached = serializers.ReadOnlyField()

    def get_category_display(self, obj):
        if not obj.category:
            return ''
        cat = TicketCategory.objects.filter(slug=obj.category).first()
        return cat.name if cat else obj.category.replace('_', ' ').title()

    class Meta:
        model = Ticket
        fields = [
            'id', 'ticket_number', 'title', 'description',
            'category', 'category_display', 'priority', 'priority_display',
            'status', 'status_display', 'location',
            'requester', 'requester_detail',
            'department', 'department_detail',
            'assigned_to', 'assigned_to_detail',
            'sla_response_due', 'sla_resolution_due',
            'first_response_at', 'resolved_at', 'closed_at',
            'is_sla_response_breached', 'is_sla_resolution_breached',
            'comments', 'attachments', 'participants',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['ticket_number', 'requester', 'created_at', 'updated_at']


class TicketCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ticket
        fields = ['title', 'description', 'category', 'priority', 'location', 'department']

    def validate(self, attrs):
        cfg = TicketFormConfig.get_config()
        errors = {}
        category = attrs.get('category', '')
        if cfg.category_required and not category:
            errors['category'] = 'Category is required.'
        elif category and not TicketCategory.objects.filter(slug=category, is_active=True).exists():
            errors['category'] = 'Invalid or inactive category.'
        if cfg.priority_required and not attrs.get('priority'):
            errors['priority'] = 'Priority is required.'
        if cfg.department_required and not attrs.get('department'):
            errors['department'] = 'Department is required.'
        if cfg.location_required and not attrs.get('location', '').strip():
            errors['location'] = 'Location is required.'
        if errors:
            raise serializers.ValidationError(errors)
        return attrs
