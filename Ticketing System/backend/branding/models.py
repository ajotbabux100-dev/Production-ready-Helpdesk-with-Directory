from django.db import models
from django.db import transaction


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
