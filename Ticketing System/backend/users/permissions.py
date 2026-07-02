from rest_framework.permissions import BasePermission


def require_perm(module, action):
    """Returns a DRF permission class requiring the given "module.action"
    right (see users/rbac.py for the catalog). Usable both as a static
    `permission_classes = [require_perm('reports', 'view')]` (DRF
    instantiates it) and as `return [require_perm('x', 'y')()]` inside a
    get_permissions() override (matches this codebase's existing style)."""
    class _RequirePerm(BasePermission):
        def has_permission(self, request, view):
            return request.user.is_authenticated and request.user.has_perm_key(module, action)
    _RequirePerm.__name__ = f'Require_{module}_{action}'
    return _RequirePerm


class IsSuper(BasePermission):
    """"Sees/does everything" bypass - for the handful of checks that were
    never a specific page's CRUD right (e.g. the safeguard on Roles
    themselves needing at least one is_super role to remain)."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_admin
