"""Static permission catalog for the dynamic RBAC system.

Each entry is a (module, action) pair with a human-readable label, used to
render the Settings -> Roles permission matrix and to validate/seed Role
permission lists. This catalog is code-defined (not a DB table) since the
set of controllable pages/actions in the product changes with deployments,
not with admin configuration.

Modules get standard CRUD (view/add/edit/delete) except:
- reports: view only (no add/edit/delete concept)
- audit: view/export/delete (no add/edit concept - "delete" gates the
  bulk purge action, which always exports a backup in the same request)
- settings: view/edit (no add/delete concept)
- tickets: CRUD plus workflow actions that can't be inferred from CRUD
  (escalate, claim, internal_note, manage_escalated, view_all) - kept as
  named rights rather than dropped or permanently hardcoded to role names.
"""

CRUD = ['view', 'add', 'edit', 'delete']

MODULE_ACTIONS = {
    'tickets': CRUD + ['escalate', 'claim', 'internal_note', 'manage_escalated', 'view_all'],
    'departments': CRUD,
    'directory_tabs': CRUD,
    'directory_portals': CRUD,
    'portal_categories': CRUD,
    'users': CRUD,
    'roles': CRUD,
    'vault': CRUD,
    'reports': ['view'],
    'audit': ['view', 'export', 'delete'],
    'settings': ['view', 'edit'],
}

MODULE_LABELS = {
    'tickets': 'Tickets',
    'departments': 'Departments',
    'directory_tabs': 'Directory (tabs & entries)',
    'directory_portals': 'Portals',
    'portal_categories': 'Portal Categories',
    'users': 'Users',
    'roles': 'Roles',
    'vault': 'Password Vault',
    'reports': 'Reports',
    'audit': 'Audit Log',
    'settings': 'Settings',
}

ACTION_LABELS = {
    'view': 'View',
    'add': 'Add',
    'edit': 'Edit',
    'delete': 'Delete',
    'export': 'Export',
    'escalate': 'Escalate Tickets',
    'claim': 'Claim Pool Tickets',
    'internal_note': 'Post Internal Notes',
    'manage_escalated': 'Manage Escalated Tickets',
    'view_all': 'View All Tickets (All Departments)',
}

ALL_PERMISSION_KEYS = {
    f'{module}.{action}'
    for module, actions in MODULE_ACTIONS.items()
    for action in actions
}


def _build_permission_catalog():
    return [
        {
            'module': module,
            'module_label': MODULE_LABELS[module],
            'actions': [
                {'key': f'{module}.{action}', 'action': action, 'label': ACTION_LABELS[action]}
                for action in actions
            ],
        }
        for module, actions in MODULE_ACTIONS.items()
    ]


# Built once at import time, not per-request - MODULE_ACTIONS/MODULE_LABELS/
# ACTION_LABELS are static code-defined dicts (see module docstring), so
# there's nothing to invalidate and nothing gained by rebuilding this on
# every call to PermissionCatalogView / every role-permission validation.
_PERMISSION_CATALOG = _build_permission_catalog()


def permission_catalog():
    """Returns the catalog as a list of {module, module_label, actions: [{key, action, label}]}."""
    return _PERMISSION_CATALOG
