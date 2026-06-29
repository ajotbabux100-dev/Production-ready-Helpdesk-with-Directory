from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('departments', '0005_department_routing_mode'),
    ]

    operations = [
        migrations.AddField(
            model_name='department',
            name='mention_scope',
            field=models.CharField(
                choices=[('department', 'Department Only'), ('all', 'All Users')],
                default='all',
                help_text='Controls who can be @mentioned in ticket comments for this department.',
                max_length=20,
            ),
        ),
    ]
