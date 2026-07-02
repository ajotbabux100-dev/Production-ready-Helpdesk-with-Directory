from django.contrib import admin
from django.urls import path, re_path, include
from django.conf import settings
from django.views.static import serve as static_serve
from django.http import JsonResponse
from django.db import connection
import time

def health_check(request):
    try:
        connection.ensure_connection()
        db_ok = True
    except Exception:
        db_ok = False
    status = 200 if db_ok else 503
    return JsonResponse({'status': 'ok' if db_ok else 'degraded', 'db': db_ok, 'ts': int(time.time())}, status=status)

urlpatterns = [
    path('health/', health_check),
    path('admin/', admin.site.urls),
    path('api/auth/', include('users.urls')),
    path('api/departments/', include('departments.urls')),
    path('api/tickets/', include('tickets.urls')),
    path('api/notifications/', include('notifications.urls')),
    path('api/audit/', include('audit.urls')),
    path('api/reports/', include('reports.urls')),
    path('api/branding/', include('branding.urls')),
    path('api/directory/', include('directory.urls')),
    path('api/vault/', include('vault.urls')),
    # Only low-sensitivity media (profile pictures, branding logos/favicons)
    # is served unauthenticated under /media/. Deliberately NOT using
    # django.conf.urls.static.static() here - that helper is a no-op
    # unless DEBUG=True, and it would also serve the ENTIRE media tree
    # (including ticket attachments, which can be confidential documents)
    # with zero permission checks. Attachments are served instead via
    # AttachmentDownloadView (see tickets/urls.py), which requires auth and
    # re-checks the same ticket visibility rules as the API.
    re_path(
        r'^media/(?P<path>(avatars|branding)/.*)$',
        static_serve,
        {'document_root': settings.MEDIA_ROOT},
    ),
]
