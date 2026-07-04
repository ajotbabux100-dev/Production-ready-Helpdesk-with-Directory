import logging

from rest_framework import viewsets, status, generics
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.exceptions import NotFound
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from django.http import FileResponse

from rest_framework.views import APIView
from .models import Ticket, Comment, Attachment, CommentAttachment, TicketFormConfig, TicketCategory, TicketParticipant
from .serializers import (
    TicketListSerializer, TicketDetailSerializer,
    TicketCreateSerializer, CommentSerializer, AttachmentSerializer,
    CommentAttachmentSerializer,
    TicketFormConfigSerializer, TicketCategorySerializer, TicketParticipantSerializer,
)
from .filters import TicketFilter
from .sla import apply_sla
from .auto_assign import auto_assign
from .validators import attachment_validation_error
from users.permissions import require_perm
from audit.utils import log_action
from audit.models import AuditLog
from notifications.tasks import send_ticket_notification
from notifications.email import notify_ticket_escalated

logger = logging.getLogger(__name__)


def visible_tickets_for(user, qs=None):
    """The single source of truth for "which tickets can this user see" -
    shared by TicketViewSet.get_queryset() and anything else (e.g. the
    attachment download view) that needs to authorize access to a ticket
    or its related objects without duplicating/drifting from this logic."""
    if qs is None:
        qs = Ticket.objects.select_related('requester', 'department', 'assigned_to')

    # Invited/participated tickets visible to everyone regardless of role
    invited_qs = qs.filter(
        participants__user=user,
        participants__status__in=(TicketParticipant.ACTIVE, TicketParticipant.CONTRIBUTED),
    )

    # Own submitted tickets are always visible, regardless of role/scope -
    # otherwise a staff member's own request could fall outside their
    # department/assignment scope and become invisible to them.
    own_qs = qs.filter(requester=user)

    if user.is_admin or user.has_perm_key('tickets', 'view_all'):
        return qs.all()
    if user.has_perm_key('tickets', 'manage_escalated'):
        return (qs.filter(department=user.department) | invited_qs | own_qs).distinct()
    if user.has_perm_key('tickets', 'claim'):
        return (qs.filter(assigned_to=user) | qs.filter(department=user.department) | invited_qs | own_qs).distinct()
    return (own_qs | invited_qs).distinct()


class TicketViewSet(viewsets.ModelViewSet):
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = TicketFilter
    search_fields = ['ticket_number', 'title', 'description', 'requester__email']
    ordering_fields = ['created_at', 'updated_at', 'priority', 'status']
    ordering = ['-created_at']

    def get_permissions(self):
        # NOTE: this override takes full control of permission resolution -
        # per-action `@action(permission_classes=...)` kwargs are NOT
        # consulted by DRF once get_permissions() is overridden, so every
        # custom action must be handled explicitly here.
        if self.action == 'create':
            return [require_perm('tickets', 'add')()]
        if self.action in ['update', 'partial_update']:
            return [require_perm('tickets', 'edit')()]
        if self.action == 'destroy':
            return [require_perm('tickets', 'delete')()]
        if self.action in ['assign', 'update_status', 'claim']:
            return [require_perm('tickets', 'claim')()]
        if self.action == 'escalate':
            return [require_perm('tickets', 'escalate')()]
        return [require_perm('tickets', 'view')()]

    def get_queryset(self):
        qs = Ticket.objects.select_related(
            'requester', 'department', 'assigned_to'
        ).prefetch_related('comments', 'attachments', 'participants__user', 'participants__invited_by')
        return visible_tickets_for(self.request.user, qs)

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return TicketDetailSerializer
        if self.action in ['create']:
            return TicketCreateSerializer
        return TicketListSerializer

    def perform_create(self, serializer):
        ticket = serializer.save(requester=self.request.user)
        apply_sla(ticket)
        auto_assign(ticket)
        ticket.save()
        log_action(self.request.user, AuditLog.TICKET_CREATED,
                   description=f'Ticket {ticket.ticket_number} created',
                   ticket=ticket, request=self.request)
        send_ticket_notification.delay('ticket_created', ticket.id)
        if ticket.assigned_to:
            log_action(self.request.user, AuditLog.TICKET_ASSIGNED,
                       description=f'Ticket {ticket.ticket_number} auto-assigned to {ticket.assigned_to.full_name}',
                       ticket=ticket, request=self.request)
            send_ticket_notification.delay('ticket_assigned', ticket.id)

    @action(detail=True, methods=['patch'])
    def assign(self, request, pk=None):
        ticket = self.get_object()
        if ticket.status == Ticket.ESCALATED and not request.user.has_perm_key('tickets', 'manage_escalated'):
            return Response(
                {'error': 'This ticket is escalated. Only someone who can manage escalated tickets can reassign it.'},
                status=403,
            )
        assigned_to_id = request.data.get('assigned_to')
        department_id = request.data.get('department')

        old_assignee = ticket.assigned_to
        old_dept = ticket.department

        if department_id:
            from departments.models import Department
            if not Department.objects.filter(pk=department_id, is_active=True).exists():
                return Response({'error': 'Invalid or inactive department.'}, status=400)
            ticket.department_id = department_id
        if assigned_to_id:
            from users.models import User as UserModel
            assignee = UserModel.objects.filter(pk=assigned_to_id, is_active=True).select_related('role').first()
            if not assignee:
                return Response({'error': 'Invalid or inactive user.'}, status=400)
            if not (assignee.is_admin or assignee.has_perm_key('tickets', 'claim')):
                return Response({'error': 'This user is not eligible to be assigned tickets.'}, status=400)
            ticket.assigned_to_id = assigned_to_id
            if ticket.status == Ticket.NEW:
                ticket.status = Ticket.ASSIGNED

        ticket.save()

        action_type = AuditLog.TICKET_REASSIGNED if old_assignee else AuditLog.TICKET_ASSIGNED
        log_action(request.user, action_type,
                   description=f'Ticket {ticket.ticket_number} assigned',
                   ticket=ticket, request=request)
        send_ticket_notification.delay('ticket_assigned', ticket.id)
        return Response(TicketDetailSerializer(ticket).data)

    @action(detail=True, methods=['post'])
    def escalate(self, request, pk=None):
        """Agent escalates a ticket to the department manager."""
        ticket = self.get_object()

        # Managers/admins (who can manage escalated tickets directly) don't escalate upward
        if request.user.has_perm_key('tickets', 'manage_escalated'):
            return Response({'error': 'You can handle this directly without escalating.'}, status=400)
        if ticket.status == Ticket.ESCALATED:
            return Response({'error': 'Ticket is already escalated.'}, status=400)

        # Determine the escalation target: department manager first, else anyone who manages escalated tickets
        manager = None
        if ticket.department_id and ticket.department.manager_id:
            manager = ticket.department.manager
        if not manager:
            from users.models import User
            candidates = User.objects.filter(is_active=True).select_related('role')
            manager = next(
                (u for u in candidates if u.is_admin or u.has_perm_key('tickets', 'manage_escalated')),
                None,
            )
        if not manager:
            return Response({'error': 'No manager found to escalate to. Please configure a department manager.'}, status=400)

        reason = request.data.get('reason', '').strip()
        escalated_by_name = request.user.full_name

        ticket.assigned_to = manager
        ticket.status = Ticket.ESCALATED
        ticket.save(update_fields=['assigned_to', 'status'])

        # Save escalation reason as an internal comment
        if reason:
            from tickets.models import Comment
            Comment.objects.create(
                ticket=ticket,
                author=request.user,
                body=f'Escalation reason: {reason}',
                is_internal=True,
            )

        log_action(request.user, AuditLog.STATUS_CHANGED,
                   description=f'Ticket {ticket.ticket_number} escalated to {manager.full_name} by {escalated_by_name}',
                   old_value=Ticket.ASSIGNED, new_value=Ticket.ESCALATED,
                   ticket=ticket, request=request)

        # Notify the manager directly (needs extra context not in the generic dispatcher)
        try:
            notify_ticket_escalated(ticket, escalated_by=escalated_by_name, reason=reason)
        except Exception:
            logger.exception('Escalation email error for ticket %s', ticket.ticket_number)

        return Response(TicketDetailSerializer(ticket).data)

    @action(detail=True, methods=['post'])
    def claim(self, request, pk=None):
        """Pool-mode: an agent self-assigns an unassigned ticket from the department queue."""
        ticket = self.get_object()
        if ticket.assigned_to_id:
            return Response({'error': 'This ticket is already assigned to someone.'}, status=400)
        ticket.assigned_to = request.user
        ticket.status = Ticket.IN_PROGRESS
        ticket.save(update_fields=['assigned_to', 'status'])
        log_action(request.user, AuditLog.TICKET_ASSIGNED,
                   description=f'Ticket {ticket.ticket_number} claimed by {request.user.full_name}',
                   ticket=ticket, request=request)
        send_ticket_notification.delay('ticket_assigned', ticket.id)
        return Response(TicketDetailSerializer(ticket).data)

    @action(detail=True, methods=['post'])
    def reopen(self, request, pk=None):
        ticket = self.get_object()
        REOPENABLE = (Ticket.RESOLVED, Ticket.CLOSED, Ticket.ASSIGNED)
        if ticket.status not in REOPENABLE:
            return Response({'error': 'Ticket cannot be reopened from its current status.'}, status=400)

        old_status = ticket.status
        # Assigned → back to New; Resolved/Closed → Reopened
        ticket.status = Ticket.NEW if old_status == Ticket.ASSIGNED else Ticket.REOPENED
        ticket.assigned_to = None if old_status == Ticket.ASSIGNED else ticket.assigned_to
        ticket.resolved_at = None
        ticket.closed_at = None
        ticket.save(update_fields=['status', 'assigned_to', 'resolved_at', 'closed_at'])

        log_action(request.user, AuditLog.STATUS_CHANGED,
                   description=f'Ticket {ticket.ticket_number} reopened',
                   old_value=old_status, new_value=Ticket.REOPENED,
                   ticket=ticket, request=request)
        send_ticket_notification.delay('status_updated', ticket.id)
        return Response(TicketDetailSerializer(ticket).data)

    @action(detail=True, methods=['patch'])
    def update_status(self, request, pk=None):
        ticket = self.get_object()
        if ticket.status == Ticket.ESCALATED and not request.user.has_perm_key('tickets', 'manage_escalated'):
            return Response(
                {'error': 'This ticket is escalated. Only someone who can manage escalated tickets can update its status.'},
                status=403,
            )
        new_status = request.data.get('status')
        if new_status not in dict(Ticket.STATUS_CHOICES):
            return Response({'error': 'Invalid status.'}, status=400)

        if ticket.status in (Ticket.RESOLVED, Ticket.CLOSED) and new_status != Ticket.REOPENED:
            return Response(
                {'error': 'This ticket is resolved/closed. Reopen it before changing the status further.'},
                status=400,
            )

        old_status = ticket.status
        ticket.status = new_status

        if new_status == Ticket.RESOLVED and not ticket.resolved_at:
            ticket.resolved_at = timezone.now()
        if new_status == Ticket.CLOSED and not ticket.closed_at:
            ticket.closed_at = timezone.now()
        if new_status == Ticket.IN_PROGRESS and not ticket.first_response_at:
            ticket.first_response_at = timezone.now()

        ticket.save()
        log_action(request.user, AuditLog.STATUS_CHANGED,
                   description=f'Status changed on {ticket.ticket_number}',
                   old_value=old_status, new_value=new_status,
                   ticket=ticket, request=request)
        send_ticket_notification.delay('status_updated', ticket.id)
        return Response(TicketDetailSerializer(ticket).data)

    @action(detail=True, methods=['post'])
    def invite(self, request, pk=None):
        """@mention: invite a user as a contributor to this ticket."""
        ticket = self.get_object()
        user_id = request.data.get('user_id')
        if not user_id:
            return Response({'error': 'user_id is required.'}, status=400)
        from users.models import User as UserModel
        try:
            invitee = UserModel.objects.get(id=user_id, is_active=True)
        except UserModel.DoesNotExist:
            return Response({'error': 'User not found.'}, status=404)
        if invitee == ticket.requester or invitee == ticket.assigned_to:
            return Response({'error': 'This user is already the requester or assignee.'}, status=400)

        participant, created = TicketParticipant.objects.get_or_create(
            ticket=ticket, user=invitee,
            defaults={'invited_by': request.user, 'status': TicketParticipant.ACTIVE},
        )
        # Re-inviting someone who previously exited OR already contributed
        # brings them back to Active - a re-invite should always mean "come
        # back and look at this again", not silently no-op.
        reactivated = False
        if not created and participant.status != TicketParticipant.ACTIVE:
            participant.status = TicketParticipant.ACTIVE
            participant.invited_by = request.user
            participant.save(update_fields=['status', 'invited_by'])
            reactivated = True

        if created or reactivated:
            from notifications.email import _push
            _push(
                invitee, ticket, 'ticket_assigned',
                f'{request.user.full_name} mentioned you in ticket {ticket.ticket_number}',
                f'You have been invited to contribute to "{ticket.title}".',
            )

        log_action(request.user, AuditLog.COMMENT_ADDED,
                   description=f'{invitee.full_name} invited to {ticket.ticket_number} by {request.user.full_name}',
                   ticket=ticket, request=request)
        return Response(TicketParticipantSerializer(participant).data, status=201 if created else 200)

    @action(detail=True, methods=['post'], url_path='exit_participation')
    def exit_participation(self, request, pk=None):
        """Invited user removes themselves from the ticket."""
        ticket = self.get_object()
        try:
            p = TicketParticipant.objects.get(ticket=ticket, user=request.user)
        except TicketParticipant.DoesNotExist:
            return Response({'error': 'You are not a participant of this ticket.'}, status=404)
        p.status = TicketParticipant.EXITED
        p.save(update_fields=['status'])
        return Response({'status': 'exited'})

    @action(detail=True, methods=['post'], url_path='mark_contributed')
    def mark_contributed(self, request, pk=None):
        """Invited user marks their participation as contributed."""
        ticket = self.get_object()
        try:
            p = TicketParticipant.objects.get(ticket=ticket, user=request.user)
        except TicketParticipant.DoesNotExist:
            return Response({'error': 'You are not a participant of this ticket.'}, status=404)
        p.status = TicketParticipant.CONTRIBUTED
        p.save(update_fields=['status'])
        return Response({'status': 'contributed'})

    @action(detail=True, methods=['post'])
    def add_comment(self, request, pk=None):
        ticket = self.get_object()
        is_internal = request.data.get('is_internal', False)
        # Multipart requests (used when attaching files) send this as the
        # string 'true'/'false', not a JSON boolean - normalize either way.
        if isinstance(is_internal, str):
            is_internal = is_internal.lower() == 'true'

        if is_internal and not request.user.has_perm_key('tickets', 'internal_note'):
            return Response({'error': 'Only agents can post internal notes.'}, status=403)

        # Replies are locked once a ticket is resolved/closed - reopen it first.
        # Internal notes stay allowed so agents can log follow-up context
        # without having to reopen (and thus re-notify the requester).
        if not is_internal and ticket.status in (Ticket.RESOLVED, Ticket.CLOSED):
            return Response(
                {'error': 'This ticket is resolved/closed. Reopen it to add a reply.'},
                status=400,
            )

        files = request.FILES.getlist('files')
        for file in files:
            error = attachment_validation_error(file)
            if error:
                return Response({'error': error}, status=400)

        serializer = CommentSerializer(data={
            'ticket': ticket.id,
            'body': request.data.get('body', ''),
            'is_internal': is_internal,
        })
        serializer.is_valid(raise_exception=True)
        comment = serializer.save(author=request.user, ticket=ticket)

        for file in files:
            CommentAttachment.objects.create(
                comment=comment,
                uploaded_by=request.user,
                file=file,
                filename=file.name,
                file_size=file.size,
                content_type=file.content_type,
            )

        if not ticket.first_response_at and request.user.has_perm_key('tickets', 'internal_note'):
            ticket.first_response_at = timezone.now()
            ticket.save(update_fields=['first_response_at'])

        log_action(request.user, AuditLog.COMMENT_ADDED,
                   description=f'Comment added to {ticket.ticket_number}',
                   ticket=ticket, request=request)
        if not is_internal:
            send_ticket_notification.delay('comment_added', ticket.id)
        return Response(CommentSerializer(comment).data, status=201)

    @action(detail=True, methods=['post'])
    def add_attachment(self, request, pk=None):
        ticket = self.get_object()
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file provided.'}, status=400)

        error = attachment_validation_error(file)
        if error:
            return Response({'error': error}, status=400)

        attachment = Attachment.objects.create(
            ticket=ticket,
            uploaded_by=request.user,
            file=file,
            filename=file.name,
            file_size=file.size,
            content_type=file.content_type,
        )
        log_action(request.user, AuditLog.ATTACHMENT_ADDED,
                   description=f'Attachment {file.name} added to {ticket.ticket_number}',
                   ticket=ticket, request=request)
        return Response(AttachmentSerializer(attachment).data, status=201)


class AttachmentDownloadView(generics.GenericAPIView):
    """Serves a ticket attachment's bytes directly, gated by the same
    visibility rules as TicketViewSet - attachments can contain confidential
    documents, so they are deliberately NOT reachable via a plain /media/
    URL (see config/urls.py, which only publicly serves avatars/branding)."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            attachment = Attachment.objects.select_related('ticket').get(pk=pk)
        except Attachment.DoesNotExist:
            raise NotFound('Attachment not found.')

        if not visible_tickets_for(request.user).filter(pk=attachment.ticket_id).exists():
            # 404, not 403 - don't confirm the attachment/ticket exists to
            # someone who isn't authorized to see it.
            raise NotFound('Attachment not found.')

        return FileResponse(
            attachment.file.open('rb'),
            as_attachment=True,
            filename=attachment.filename,
            content_type=attachment.content_type or None,
        )


class CommentAttachmentDownloadView(generics.GenericAPIView):
    """Same as AttachmentDownloadView, gating a comment's attachment by
    whether the underlying ticket is visible to the requesting user."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            attachment = CommentAttachment.objects.select_related('comment__ticket').get(pk=pk)
        except CommentAttachment.DoesNotExist:
            raise NotFound('Attachment not found.')

        if not visible_tickets_for(request.user).filter(pk=attachment.comment.ticket_id).exists():
            raise NotFound('Attachment not found.')

        return FileResponse(
            attachment.file.open('rb'),
            as_attachment=True,
            filename=attachment.filename,
            content_type=attachment.content_type or None,
        )


class TicketCategoryViewSet(viewsets.ModelViewSet):
    """
    GET  — all authenticated users (to populate the form dropdown)
    POST/PATCH/DELETE — requires settings.edit (managed from Settings -> Categories)

    Query params:
      ?active_only=true   — only return active categories
      ?department=<id>    — return categories linked to this dept PLUS global (no dept) categories
    """
    serializer_class = TicketCategorySerializer
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['name', 'slug']
    ordering_fields = ['order', 'name']

    def get_queryset(self):
        from django.db.models import Q
        qs = TicketCategory.objects.prefetch_related('departments')

        if self.request.query_params.get('active_only') == 'true':
            qs = qs.filter(is_active=True)

        dept_id = self.request.query_params.get('department')
        if dept_id:
            qs = qs.filter(
                Q(departments__id=dept_id) | Q(departments__isnull=True)
            ).distinct()

        return qs

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated()]
        return [require_perm('settings', 'edit')()]


class TicketFormConfigView(APIView):
    """GET — anyone authenticated. PATCH — requires settings.edit."""

    def get(self, request):
        cfg = TicketFormConfig.get_config()
        return Response(TicketFormConfigSerializer(cfg).data)

    def patch(self, request):
        if not request.user.has_perm_key('settings', 'edit'):
            return Response({'error': 'You do not have permission to edit settings.'}, status=403)
        cfg = TicketFormConfig.get_config()
        serializer = TicketFormConfigSerializer(cfg, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
