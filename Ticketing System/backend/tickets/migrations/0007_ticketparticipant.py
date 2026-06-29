from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('tickets', '0006_ticketcategory_departments'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='TicketParticipant',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(
                    choices=[('active', 'Active'), ('contributed', 'Contributed'), ('exited', 'Exited')],
                    default='active',
                    max_length=20,
                )),
                ('invited_at', models.DateTimeField(auto_now_add=True)),
                ('invited_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='sent_invitations',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('ticket', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='participants',
                    to='tickets.ticket',
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='ticket_participations',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['invited_at'],
                'unique_together': {('ticket', 'user')},
            },
        ),
    ]
