from rest_framework import serializers
from .models import Department, SLAPolicy


class SLAPolicySerializer(serializers.ModelSerializer):
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    response_time_display = serializers.ReadOnlyField()
    resolution_time_display = serializers.ReadOnlyField()

    class Meta:
        model = SLAPolicy
        fields = [
            'id', 'department', 'priority', 'priority_display',
            'response_time_minutes', 'resolution_time_minutes',
            'response_time_display', 'resolution_time_display',
        ]


class DepartmentSerializer(serializers.ModelSerializer):
    manager_name = serializers.CharField(source='manager.full_name', read_only=True)
    auto_assign_to_name = serializers.CharField(source='auto_assign_to.full_name', read_only=True)
    member_count = serializers.SerializerMethodField()
    sla_policies = SLAPolicySerializer(many=True, read_only=True)
    categories = serializers.SerializerMethodField()

    class Meta:
        model = Department
        fields = [
            'id', 'name', 'description', 'email',
            'manager', 'manager_name',
            'auto_assign_to', 'auto_assign_to_name',
            'routing_mode', 'mention_scope',
            'is_active', 'member_count', 'sla_policies', 'categories',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_member_count(self, obj):
        # DepartmentViewSet's queryset annotates this so listing N departments
        # doesn't run N extra COUNT queries; fall back to a direct count for
        # any instance that didn't come through that queryset (e.g. the
        # response right after creating a new department).
        annotated = getattr(obj, 'member_count_annotated', None)
        if annotated is not None:
            return annotated
        return obj.members.filter(is_active=True).count()

    def get_categories(self, obj):
        # Same reasoning - DepartmentViewSet's queryset Prefetches this
        # relation already filtered/ordered, so .all() hits that cache
        # instead of firing a fresh query per department.
        return [
            {'id': c.id, 'name': c.name, 'color': c.color, 'slug': c.slug}
            for c in obj.categories.all()
        ]


class DepartmentMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ['id', 'name', 'email', 'is_active', 'routing_mode', 'mention_scope']
