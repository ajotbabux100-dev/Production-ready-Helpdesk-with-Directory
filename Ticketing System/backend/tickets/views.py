from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone

from rest_framework.views import APIView
from .models import Ticket, Comment, Attachment, TicketFormConfig, TicketCategory
from .serializers import (
    TicketListSerializer, TicketDetailSerializer,
    TicketCreateSerializer, CommentSerializer, AttachmentSerializer,
    TicketFormConfigSerializer, TicketCategorySerializer,
)
from .filters import TicketFilter
from .sla import apply_sla
from .auto_assign import auto_assign
from users.permissions import IsAgentOrAbove
from audit.utils import log_action
from audit.models import AuditLog
from notifications.tasks import send_ticket_notification


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
        ).prefetch_related('comments', 'attachments')

        if user.is_admin:
            return qs.all()
        if user.is_manager_or_above:
            return qs.filter(department=user.department)
        if user.is_agent_or_above:
            return qs.filter(assigned_to=user) | qs.filter(department=user.department)
        return qs.filter(requester=user)

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
