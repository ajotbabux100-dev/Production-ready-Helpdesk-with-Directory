from .models import AuditLog


def log_action(user, action, description='', old_value='', new_value='', ticket=None, request=None):
    ip = None
    user_agent = ''
    if request:
        # REMOTE_ADDR, not a manual X-Forwarded-For re-parse: waitress is
        # started with --trusted-proxy=127.0.0.1 --trusted-proxy-headers=
        # x-forwarded-for, so it already resolves REMOTE_ADDR to the real
        # client IP itself (trusting only the nginx hop). Re-parsing the raw
        # header here and taking split(',')[0] would instead pick up
        # whatever value a client prepends themselves - nginx's
        # $proxy_add_x_forwarded_for appends rather than replaces, so a
        # spoofed leading IP survives untouched all the way to this code.
        ip = request.META.get('REMOTE_ADDR')
        user_agent = request.META.get('HTTP_USER_AGENT', '')[:300]
    AuditLog.objects.create(
        user=user,
        action=action,
        ticket=ticket,
        description=description,
        old_value=str(old_value),
        new_value=str(new_value),
        ip_address=ip,
        user_agent=user_agent,
    )
