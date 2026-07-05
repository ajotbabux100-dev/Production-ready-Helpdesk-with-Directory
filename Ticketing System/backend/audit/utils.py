from .models import AuditLog


def log_action(user, action, description='', old_value='', new_value='', ticket=None, request=None):
    ip = None
    user_agent = ''
    if request:
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        ip = x_forwarded_for.split(',')[0] if x_forwarded_for else request.META.get('REMOTE_ADDR')
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
