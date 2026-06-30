import django_filters
from .models import Ticket, TicketParticipant


class TicketFilter(django_filters.FilterSet):
    created_after = django_filters.DateFilter(field_name='created_at', lookup_expr='gte')
    created_before = django_filters.DateFilter(field_name='created_at', lookup_expr='lte')
    status__in = django_filters.BaseInFilter(field_name='status', lookup_expr='in')
    invited_only = django_filters.BooleanFilter(method='filter_invited_only')
    assigned_to_me = django_filters.BooleanFilter(method='filter_assigned_to_me')

    def filter_invited_only(self, queryset, name, value):
        if value:
            user = self.request.user
            return queryset.filter(
                participants__user=user,
                participants__status__in=(TicketParticipant.ACTIVE, TicketParticipant.CONTRIBUTED),
            ).distinct()
        return queryset

    def filter_assigned_to_me(self, queryset, name, value):
        if value:
            return queryset.filter(assigned_to=self.request.user)
        return queryset

    class Meta:
        model = Ticket
        fields = ['status', 'priority', 'category', 'department', 'assigned_to', 'requester']
