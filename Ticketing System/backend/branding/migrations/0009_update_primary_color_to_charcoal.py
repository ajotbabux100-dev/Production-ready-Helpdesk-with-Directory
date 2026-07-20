from django.db import migrations, models


def set_charcoal_color(apps, schema_editor):
    SystemSettings = apps.get_model('branding', 'SystemSettings')
    SystemSettings.objects.filter(pk=1).update(primary_color='#1f2330')


class Migration(migrations.Migration):

    dependencies = [
        ('branding', '0008_systemsettings_whatsapp_access_token_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='systemsettings',
            name='primary_color',
            field=models.CharField(default='#1f2330', help_text='Hex colour, e.g. #1f2330', max_length=7),
        ),
        migrations.RunPython(set_charcoal_color, migrations.RunPython.noop),
    ]
