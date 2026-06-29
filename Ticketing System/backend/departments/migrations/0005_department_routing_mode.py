from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('departments', '0004_department_auto_assign_to'),
    ]

    operations = [
        migrations.AddField(
            model_name='department',
            name='routing_mode',
            field=models.CharField(
                choices=[('manager', 'Manager Assignment'), ('pool', 'Department Pool')],
                default='manager',
                help_text=(
                    'Manager Assignment: manager assigns each ticket to a specific agent. '
                    'Department Pool: all department members see new tickets and any one of them can claim and resolve it.'
                ),
                max_length=20,
            ),
        ),
    ]
