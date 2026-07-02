from django.urls import path
from .views import (
    DashboardSummaryView, TicketsByStatusView, TicketsByPriorityView,
    TicketsByDepartmentView, TicketTrendView, AgentPerformanceView,
    SLAComplianceView, ReportsExportView,
)

urlpatterns = [
    path('dashboard/', DashboardSummaryView.as_view(), name='dashboard-summary'),
    path('tickets-by-status/', TicketsByStatusView.as_view(), name='tickets-by-status'),
    path('tickets-by-priority/', TicketsByPriorityView.as_view(), name='tickets-by-priority'),
    path('tickets-by-department/', TicketsByDepartmentView.as_view(), name='tickets-by-department'),
    path('ticket-trend/', TicketTrendView.as_view(), name='ticket-trend'),
    path('agent-performance/', AgentPerformanceView.as_view(), name='agent-performance'),
    path('sla-compliance/', SLAComplianceView.as_view(), name='sla-compliance'),
    path('export/', ReportsExportView.as_view(), name='reports-export'),
]
