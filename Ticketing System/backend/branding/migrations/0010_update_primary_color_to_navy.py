from django.db import migrations, models


def set_navy_color(apps, schema_editor):
    SystemSettings = apps.get_model('branding', 'SystemSettings')
    SystemSettings.objects.filter(pk=1).update(primary_color='#1e3a5f')


class Migration(migrations.Migration):

    dependencies = [
        ('branding', '0009_update_primary_color_to_charcoal'),
    ]

    operations = [
        migrations.AlterField(
            model_name='systemsettings',
            name='primary_color',
            field=models.CharField(default='#1e3a5f', help_text='Hex colour, e.g. #1e3a5f', max_length=7),
        ),
        migrations.RunPython(set_navy_color, migrations.RunPython.noop),
    ]
