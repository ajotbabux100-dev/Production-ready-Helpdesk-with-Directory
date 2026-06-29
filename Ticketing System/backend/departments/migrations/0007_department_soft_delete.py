from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('departments', '0006_department_mention_scope'),
    ]

    operations = [
        migrations.AddField(
            model_name='department',
            name='is_deleted',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='department',
            name='deleted_alias',
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name='department',
            name='deleted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
