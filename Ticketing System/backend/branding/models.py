from django.db import models
from django.db import transaction

# Fixed icon palette for login_highlights - keys map to lucide-react
# components on the frontend (see ICON_MAP in the login page).
LOGIN_HIGHLIGHT_ICONS = [
    'zap', 'clock', 'shield', 'check', 'users', 'mail',
    'bell', 'lock', 'star', 'globe', 'settings', 'heart',
    'trending-up', 'database', 'headset', 'sparkles',
]


def default_login_highlights():
    return [
        {'icon': 'zap', 'text': 'Auto-assign tickets to the right team instantly'},
        {'icon': 'clock', 'text': 'SLA tracking with real-time breach alerts'},
        {'icon': 'shield', 'text': 'Full audit trail and role-based access'},
        {'icon': 'check', 'text': 'Email notifications at every step'},
    ]


class SystemSettings(models.Model):
    # ---------- Organisation ----------
    company_name = models.CharField(max_length=200, default='Helpdesk')
    company_logo = models.ImageField(upload_to='branding/', null=True, blank=True)
    company_tagline = models.CharField(max_length=300, blank=True)
    company_email = models.EmailField(blank=True)
    company_phone = models.CharField(max_length=50, blank=True)
    company_website = models.URLField(blank=True)
    company_address = models.TextField(blank=True)

    # ---------- Portal ----------
    portal_name = models.CharField(max_length=200, default='Helpdesk Portal')
    portal_welcome = models.TextField(
        blank=True,
        default='Welcome! Submit and track support requests for all departments.',
    )
    support_hours = models.CharField(
        max_length=200, blank=True,
        default='Sunday - Thursday, 8 AM - 5 PM',
    )
    login_headline = models.CharField(
        max_length=200, blank=True,
        default='Resolve faster.\nWork smarter.',
        help_text='Login page hero headline. Use a newline for a two-line heading.',
    )
    login_highlights = models.JSONField(
        default=default_login_highlights, blank=True,
        help_text='List of {icon, text} bullet points shown on the login page.',
    )
    powered_by_text = models.CharField(
        max_length=200, blank=True,
        default='Powered by GSH & ISH OMAN IT',
        help_text='Shown in the sidebar footer and on the login page. Leave blank to hide.',
    )

    # ---------- Security ----------
    default_idle_timeout_minutes = models.PositiveIntegerField(
        default=15,
        help_text='Minutes of inactivity before automatic logout. A user with a personal '
                   'override (Users -> Edit User) uses that value instead.',
    )

    # ---------- Appearance ----------
    primary_color = models.CharField(max_length=7, default='#1e3a5f',
                                     help_text='Hex colour, e.g. #1e3a5f')
    favicon = models.ImageField(upload_to='branding/', null=True, blank=True)

    # ---------- Ticket Numbering ----------
    ticket_prefix = models.CharField(max_length=20, default='TKT')
    ticket_separator = models.CharField(
        max_length=5, default='-',
        help_text='Character between prefix, year and sequence (e.g. - or /)',
    )
    ticket_include_year = models.BooleanField(default=True)
    ticket_year_format = models.CharField(
        max_length=4, default='YYYY',
        choices=[('YYYY', 'Full year (2026)'), ('YY', 'Short year (26)')],
    )
    ticket_seq_digits = models.PositiveIntegerField(
        default=5,
        help_text='Zero-padded sequence length (e.g. 5 -> 00001)',
    )
    ticket_reset_yearly = models.BooleanField(
        default=True,
        help_text='Reset sequence counter on 1 Jan each year',
    )
    _ticket_counter = models.PositiveIntegerField(default=0)
    _ticket_counter_year = models.PositiveIntegerField(default=0)

    # ---------- Email SMTP ----------
    email_enabled = models.BooleanField(default=False)
    email_host = models.CharField(max_length=200, blank=True, default='smtp.office365.com')
    email_port = models.PositiveIntegerField(default=587)
    email_use_tls = models.BooleanField(default=True)
    email_use_ssl = models.BooleanField(default=False)
    email_host_user = models.CharField(max_length=200, blank=True)
    email_host_password = models.CharField(max_length=500, blank=True)
    email_timeout = models.PositiveIntegerField(default=30)

    # ---------- Email Identity ----------
    email_sender_name = models.CharField(max_length=200, default='Helpdesk')
    email_sender_address = models.EmailField(blank=True)
    email_reply_to = models.EmailField(blank=True)
    email_footer = models.TextField(blank=True)

    # ---------- Notification Events ----------
    notify_on_ticket_created = models.BooleanField(default=True)
    notify_on_ticket_assigned = models.BooleanField(default=True)
    notify_on_status_updated = models.BooleanField(default=True)
    notify_on_comment_added = models.BooleanField(default=True)
    notify_on_ticket_resolved = models.BooleanField(default=True)
    notify_on_sla_breach = models.BooleanField(default=True)

    # ---------- WhatsApp ----------
    # Provider-agnostic by design: a small set of shared fields covers Meta's
    # Cloud API and Twilio (the two mainstream providers) plus a "generic
    # webhook" mode that POSTs {to, message} to any custom endpoint - so a
    # business using a different BSP (chat-api, Wassenger, a self-hosted
    # gateway, etc.) can still integrate without new fields/migrations.
    # `whatsapp_access_token` doubles as Twilio's Auth Token when the
    # provider is 'twilio', to avoid a near-duplicate secret field.
    WHATSAPP_PROVIDER_CHOICES = [
        ('meta_cloud', 'Meta WhatsApp Cloud API'),
        ('twilio', 'Twilio'),
        ('generic', 'Generic Webhook'),
    ]
    whatsapp_enabled = models.BooleanField(default=False)
    whatsapp_provider = models.CharField(max_length=20, choices=WHATSAPP_PROVIDER_CHOICES, default='meta_cloud')

    # Meta WhatsApp Cloud API
    whatsapp_phone_number_id = models.CharField(max_length=50, blank=True)
    whatsapp_business_account_id = models.CharField(max_length=50, blank=True)
    # Meta requires an admin-approved message template for any
    # business-initiated notification (outside a customer's own 24h reply
    # window) - the template must be approved in Meta Business Manager with
    # exactly one {{1}} body placeholder, which we fill with the same
    # human-readable message already built for the in-app notification.
    whatsapp_template_name = models.CharField(max_length=100, blank=True, default='ticket_notification')
    whatsapp_template_language = models.CharField(max_length=10, blank=True, default='en_US')

    # Twilio
    whatsapp_account_sid = models.CharField(max_length=100, blank=True)
    whatsapp_sender_number = models.CharField(
        max_length=30, blank=True,
        help_text='Twilio WhatsApp-enabled sender, e.g. whatsapp:+14155238886',
    )

    # Generic webhook
    whatsapp_webhook_url = models.URLField(blank=True)

    # Shared secret (Meta permanent access token / Twilio Auth Token)
    whatsapp_access_token = models.CharField(max_length=1000, blank=True)

    # ---------- WhatsApp Notification Events ----------
    # Deliberately separate from the notify_on_* email flags above - an admin
    # may want SLA breach alerts on WhatsApp but not routine status updates,
    # independent of what's enabled for email.
    whatsapp_notify_on_ticket_created = models.BooleanField(default=False)
    whatsapp_notify_on_ticket_assigned = models.BooleanField(default=False)
    whatsapp_notify_on_status_updated = models.BooleanField(default=False)
    whatsapp_notify_on_comment_added = models.BooleanField(default=False)
    whatsapp_notify_on_ticket_resolved = models.BooleanField(default=False)
    whatsapp_notify_on_sla_breach = models.BooleanField(default=False)

    class Meta:
        verbose_name = 'System Settings'

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return f'{self.company_name} Settings'

    def build_ticket_number(self):
        """Atomically increment counter and return a formatted ticket number."""
        from django.utils import timezone
        sep = self.ticket_separator
        now_year = timezone.now().year

        with transaction.atomic():
            s = SystemSettings.objects.select_for_update().get(pk=1)
            if s.ticket_reset_yearly and s._ticket_counter_year != now_year:
                s._ticket_counter = 0
                s._ticket_counter_year = now_year
            s._ticket_counter += 1
            counter = s._ticket_counter
            seq_digits = s.ticket_seq_digits
            include_year = s.ticket_include_year
            year_format = s.ticket_year_format
            prefix = s.ticket_prefix
            sep = s.ticket_separator
            s.save(update_fields=['_ticket_counter', '_ticket_counter_year'])

        seq = str(counter).zfill(seq_digits)
        year_str = str(now_year) if year_format == 'YYYY' else str(now_year)[-2:]
        parts = [prefix]
        if include_year:
            parts.append(year_str)
        parts.append(seq)
        return sep.join(parts)

    def ticket_number_preview(self):
        from django.utils import timezone
        sep = self.ticket_separator
        seq = '1'.zfill(self.ticket_seq_digits)
        now_year = timezone.now().year
        year_str = str(now_year) if self.ticket_year_format == 'YYYY' else str(now_year)[-2:]
        parts = [self.ticket_prefix]
        if self.ticket_include_year:
            parts.append(year_str)
        parts.append(seq)
        return sep.join(parts)
