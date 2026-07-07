from rest_framework import serializers
from .models import Ticket, Comment, Attachment, CommentAttachment, TicketFormConfig, TicketCategory, TicketParticipant
from users.serializers import UserMinimalSerializer
from departments.serializers import DepartmentMinimalSerializer
from departments.models import Department


def _category_display(context, category_slug):
    """Resolves a Ticket.category slug to its display name without a query
    per row - TicketListSerializer/TicketDetailSerializer share one `context`
    dict across every row in a `many=True` list, so the lookup table built on
    the first row's call is reused for the rest of the page instead of
    re-querying TicketCategory once per ticket."""
    if not category_slug:
        return ''
    cache = context.get('_category_map')
    if cache is None:
        cache = {c.slug: c.name for c in TicketCategory.objects.all()}
        context['_category_map'] = cache
    return cache.get(category_slug) or category_slug.replace('_', ' ').title()


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
    # Deliberately not exposing the raw `file` field - its value is a direct
    # /media/ path, which is not publicly served (see config/urls.py) since
    # attachments can be confidential. `download_url` routes through the
    # permission-checked AttachmentDownloadView instead.
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = ['id', 'download_url', 'filename', 'file_size', 'content_type', 'uploaded_at', 'uploaded_by']
        read_only_fields = ['uploaded_by', 'uploaded_at']

    def get_download_url(self, obj):
        # Relative to the frontend's API base (which already includes /api),
        # not an absolute URL - kept consistent with how other endpoints are
        # referenced from the frontend (see app/lib/api.ts's baseURL).
        return f'/tickets/attachments/{obj.id}/download/'


class CommentAttachmentSerializer(serializers.ModelSerializer):
    # Same reasoning as AttachmentSerializer.download_url above - don't expose
    # the raw /media/ file path, route through the permission-checked
    # CommentAttachmentDownloadView instead.
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = CommentAttachment
        fields = ['id', 'download_url', 'filename', 'file_size', 'content_type', 'uploaded_at', 'uploaded_by']
        read_only_fields = ['uploaded_by', 'uploaded_at']

    def get_download_url(self, obj):
        return f'/tickets/comment-attachments/{obj.id}/download/'


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
        return _category_display(self.context, obj.category)

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
    comments = serializers.SerializerMethodField()
    attachments = AttachmentSerializer(many=True, read_only=True)
    participants = TicketParticipantSerializer(many=True, read_only=True)
    status_history = serializers.SerializerMethodField()
    is_sla_response_breached = serializers.ReadOnlyField()
    is_sla_resolution_breached = serializers.ReadOnlyField()

    def get_category_display(self, obj):
        return _category_display(self.context, obj.category)

    def get_status_history(self, obj):
        # The "journey" a ticket took - who created/assigned/reassigned it and
        # every status transition, oldest first, sourced from the same audit
        # log already used elsewhere rather than a separate tracking table.
        # Deliberately excludes comment/attachment events - those already
        # appear in the Activity/chat section, so including them here would
        # just duplicate the same events in two places on the print report.
        from audit.models import AuditLog
        RELEVANT_ACTIONS = (
            AuditLog.TICKET_CREATED, AuditLog.TICKET_ASSIGNED, AuditLog.TICKET_REASSIGNED,
            AuditLog.STATUS_CHANGED, AuditLog.TICKET_RESOLVED, AuditLog.TICKET_CLOSED,
            AuditLog.TICKET_REOPENED,
        )
        status_labels = dict(Ticket.STATUS_CHOICES)
        logs = obj.audit_logs.filter(action__in=RELEVANT_ACTIONS).select_related('user').order_by('timestamp')
        return [
            {
                'action': log.action,
                'action_display': log.get_action_display(),
                'description': log.description,
                'old_value': log.old_value,
                'old_value_display': status_labels.get(log.old_value, log.old_value),
                'new_value': log.new_value,
                'new_value_display': status_labels.get(log.new_value, log.new_value),
                'user_name': log.user.full_name if log.user else 'System',
                'timestamp': log.timestamp,
            }
            for log in logs
        ]

    def get_comments(self, obj):
        # Internal notes (and their attachments) are staff-only - filtering
        # them out here, not just in the frontend, closes the gap where a
        # requester's own ticket-detail response would otherwise hand them
        # the note body and a working download_url for internal-only files.
        request = self.context.get('request')
        is_staff = bool(
            request and request.user.is_authenticated
            and request.user.has_perm_key('tickets', 'internal_note')
        )
        qs = obj.comments.all() if is_staff else obj.comments.filter(is_internal=False)
        return CommentSerializer(qs, many=True, context=self.context).data

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
            'first_response_at', 'resolved_at', 'closed_at', 'resolution_note',
            'is_sla_response_breached', 'is_sla_resolution_breached',
            'comments', 'attachments', 'participants', 'status_history',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['ticket_number', 'requester', 'created_at', 'updated_at', 'resolution_note']


class TicketCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ticket
        # 'id' must be included so the frontend's create-ticket flow can read
        # res.data.id to upload attachments right after creation - without it
        # every add_attachment call there was silently hitting /tickets/undefined/.
        fields = ['id', 'title', 'description', 'category', 'priority', 'location', 'department']
        read_only_fields = ['id']

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
