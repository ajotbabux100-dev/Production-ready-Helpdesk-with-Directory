from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from .models import SystemSettings
from .serializers import SystemSettingsSerializer


class SystemSettingsView(APIView):
    """
    GET  /api/branding/  — public (used by login page, portal header)
    PATCH /api/branding/ — admin only
    """
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsAuthenticated()]

    def get(self, request):
        s = SystemSettings.get()
        return Response(SystemSettingsSerializer(s, context={'request': request}).data)

    def patch(self, request):
        if not request.user.is_authenticated or not request.user.is_admin:
            return Response({'error': 'Admin access required.'}, status=403)
        s = SystemSettings.get()
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        if data.get('company_logo') == 'null':
            s.company_logo = None
            s.save(update_fields=['company_logo'])
            data.pop('company_logo', None)
        if data.get('favicon') == 'null':
            s.favicon = None
            s.save(update_fields=['favicon'])
            data.pop('favicon', None)
        serializer = SystemSettingsSerializer(s, data=data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(SystemSettingsSerializer(s, context={'request': request}).data)


class TestEmailView(APIView):
    """POST /api/branding/test-email/ — sends a test email using the saved SMTP config."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not request.user.is_admin:
            return Response({'error': 'Admin access required.'}, status=403)

        recipient = request.data.get('recipient') or request.user.email
        if not recipient:
            return Response({'error': 'No recipient email address.'}, status=400)

        s = SystemSettings.get()
        if not s.email_enabled:
            return Response({'error': 'Email is disabled. Enable it in the Email tab first.'}, status=400)
        if not s.email_host:
            return Response({'error': 'SMTP host is not configured.'}, status=400)
        if not s.email_host_user:
            return Response({'error': 'SMTP username is not configured.'}, status=400)
        if not s.email_host_password:
            return Response({'error': 'SMTP password is not configured.'}, status=400)

        try:
            from django.core.mail import get_connection, EmailMultiAlternatives
            conn = get_connection(
                backend='django.core.mail.backends.smtp.EmailBackend',
                host=s.email_host,
                port=s.email_port,
                username=s.email_host_user,
                password=s.email_host_password,
                use_tls=s.email_use_tls,
                use_ssl=s.email_use_ssl,
                timeout=s.email_timeout or 30,
                fail_silently=False,
            )
            from_email = f'{s.email_sender_name} <{s.email_sender_address or s.email_host_user}>'
            msg = EmailMultiAlternatives(
                subject='Test Email — Helpdesk System',
                body=f'This is a test email from {s.portal_name or "Helpdesk"}.\n\nIf you received this, your SMTP configuration is working correctly.',
                from_email=from_email,
                to=[recipient],
                connection=conn,
            )
            msg.attach_alternative(
                f"""
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;border:1px solid #e5e7eb;border-radius:12px">
                  <h2 style="color:#1e3a5f;margin-top:0">✅ SMTP Test Successful</h2>
                  <p>This is a test email from <strong>{s.portal_name or 'Helpdesk'}</strong>.</p>
                  <p>Your SMTP configuration is working correctly.</p>
                  <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0">
                  <p style="color:#9ca3af;font-size:12px">
                    Sent via {s.email_host}:{s.email_port} &nbsp;|&nbsp;
                    {'TLS' if s.email_use_tls else 'SSL' if s.email_use_ssl else 'Plain'}
                  </p>
                </div>
                """,
                'text/html',
            )
            msg.send()
            return Response({'success': True, 'message': f'Test email sent to {recipient}'})
        except Exception as e:
            return Response({'success': False, 'error': str(e)}, status=400)
