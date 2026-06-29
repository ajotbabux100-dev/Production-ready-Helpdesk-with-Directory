from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone

from rest_framework.views import APIView
from .models import Ticket, Comment, Attachment, TicketFormConfig, TicketCategory, TicketParticipant
from .serializers import (
    TicketListSerializer, TicketDetailSerializer,
    TicketCreateSerializer, CommentSerializer, AttachmentSerializer,
    TicketFormConfigSerializer, TicketCategorySerializer, TicketParticipantSerializer,
)
from .filters import TicketFilter
from .sla import apply_sla
from .auto_assign import auto_assign
from users.permissions import IsAgentOrAbove
from audit.utils import log_action
from audit.models import AuditLog
from notifications.tasks import send_ticket_notification
from notifications.email import notify_ticket_escalated


class TicketViewSet(viewsets.ModelViewSet):
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = TicketFilter
    search_fields = ['ticket_number', 'title', 'description', 'requester__email']
    ordering_fields = ['created_at', 'updated_at', 'priority', 'status']
    ordering = ['-created_at']

    def get_queryset(self):
        user = self.request.user
        qs = Ticket.objects.select_related(
            'requester', 'department', 'assigned_to'
        ).prefetch_related('comments', 'attachments', 'participants__user', 'participants__invited_by')

        # Invited/participated tickets visible to everyone regardless of role
        invited_qs = qs.filter(
            participants__user=user,
            participants__status__in=(TicketParticipant.ACTIVE, TicketParticipant.CONTRIBUTED),
        )

        if user.is_admin:
            return qs.all()
        if user.is_manager_or_above:
            return (qs.filter(department=user.department) | invited_qs).distinct()
        if user.is_agent_or_above:
            return (qs.filter(assigned_to=user) | qs.filter(department=user.department) | invited_qs).distinct()
        return (qs.filter(requester=user) | invited_qs).distinct()

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

    @action(detail=True, methods=['patch'], permission_classes=[IsAgentOrAbove])
    def assign(self, request, pk=None):
        ticket = self.get_object()
        if ticket.status == Ticket.ESCALATED and not request.user.is_manager_or_above:
            return Response(
                {'error': 'This ticket is escalated. Only a manager or admin can reassign it.'},
                status=403,
            )
        assigned_to_id = request.data.get('assigned_to')
        department_id = request.data.get('department')

        old_assignee = ticket.assigned_to
        old_dept = ticket.department

        if department_id:
            ticket.department_id = department_id
        if assigned_to_id:
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

        # Only agents (not managers/admins) escalate upward
        if not request.user.is_agent_or_above:
            return Response({'error': 'Permission denied.'}, status=403)
        if request.user.is_manager_or_above:
            return Response({'error': 'Managers and admins can handle this directly without escalating.'}, status=400)
        if ticket.status == Ticket.ESCALATED:
            return Response({'error': 'Ticket is already escalated.'}, status=400)

        # Determine the escalation target: department manager first, else any admin
        manager = None
        if ticket.department_id and ticket.department.manager_id:
            manager = ticket.department.manager
        if not manager:
            from users.models import User
            manager = User.objects.filter(role__in=('manager', 'admin'), is_active=True).first()
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
        except Exception as e:
            print(f'Escalation email error: {e}')

        return Response(TicketDetailSerializer(ticket).data)

    @action(detail=True, methods=['post'])
    def claim(self, request, pk=None):
        """Pool-mode: an agent self-assigns an unassigned ticket from the department queue."""
        ticket = self.get_object()
        if not request.user.is_agent_or_above:
            return Response({'error': 'Only agents can claim tickets.'}, status=403)
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

    @action(detail=True, methods=['patch'], permission_classes=[IsAgentOrAbove])
    def update_status(self, request, pk=None):
        ticket = self.get_object()
        if ticket.status == Ticket.ESCALATED and not request.user.is_manager_or_above:
            return Response(
                {'error': 'This ticket is escalated. Only a manager or admin can update its status.'},
                status=403,
            )
        new_status = request.data.get('status')
        if new_status not in dict(Ticket.STATUS_CHOICES):
            return Response({'error': 'Invalid status.'}, status=400)

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
        if not created and participant.status == TicketParticipant.EXITED:
            participant.status = TicketParticipant.ACTIVE
            participant.invited_by = request.user
            participant.save(update_fields=['status', 'invited_by'])

        if created or participant.status == TicketParticipant.ACTIVE:
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

        if is_internal and not request.user.is_agent_or_above:
            return Response({'error': 'Only agents can post internal notes.'}, status=403)

        serializer = CommentSerializer(data={
            'ticket': ticket.id,
            'body': request.data.get('body', ''),
            'is_internal': is_internal,
        })
        serializer.is_valid(raise_exception=True)
        comment = serializer.save(author=request.user, ticket=ticket)

        if not ticket.first_response_at and request.user.is_agent_or_above:
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


class TicketCategoryViewSet(viewsets.ModelViewSet):
    """
    GET  — all authenticated users (to populate the form dropdown)
    POST/PATCH/DELETE — admins only

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
        from users.permissions import IsAdminUser
        return [IsAdminUser()]


class TicketFormConfigView(APIView):
    """GET — anyone authenticated. PATCH — admins only."""

    def get(self, request):
        cfg = TicketFormConfig.get_config()
        return Response(TicketFormConfigSerializer(cfg).data)

    def patch(self, request):
        from users.permissions import IsAdminUser
        if not request.user.is_admin:
            return Response({'error': 'Admin access required.'}, status=403)
        cfg = TicketFormConfig.get_config()
        serializer = TicketFormConfigSerializer(cfg, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
