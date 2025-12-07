# Generated manually on 2025-11-25
# Remove unique constraint from Feed.url to allow duplicate feeds

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0013_move_groups_to_feed"),
    ]

    operations = [
        migrations.AlterField(
            model_name="feed",
            name="url",
            field=models.URLField(help_text="RSS feed URL", max_length=500),
        ),
    ]
