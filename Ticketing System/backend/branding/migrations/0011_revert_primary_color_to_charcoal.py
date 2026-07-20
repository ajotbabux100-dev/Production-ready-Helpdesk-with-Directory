from django.db import migrations, models


def set_charcoal(apps, schema_editor):
    SystemSettings = apps.get_model('branding', 'SystemSettings')
    SystemSettings.objects.filter(pk=1).update(primary_color='#1f2330')


class Migration(migrations.Migration):

    dependencies = [
        ('branding', '0010_update_primary_color_to_navy'),
    ]

    operations = [
        migrations.AlterField(
            model_name='systemsettings',
            name='primary_color',
            field=models.CharField(default='#1f2330', help_text='Hex colour, e.g. #1f2330', max_length=7),
        ),
        migrations.RunPython(set_charcoal, migrations.RunPython.noop),
    ]
