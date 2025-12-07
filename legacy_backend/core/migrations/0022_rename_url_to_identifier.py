# Generated migration to rename url field to identifier

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0021_add_reddit_support_fields'),
    ]

    operations = [
        # Rename the url field to identifier
        migrations.RenameField(
            model_name='feed',
            old_name='url',
            new_name='identifier',
        ),
        # Change the field type from URLField to CharField
        migrations.AlterField(
            model_name='feed',
            name='identifier',
            field=models.CharField(
                max_length=500,
                help_text='Feed identifier (URL for RSS feeds, subreddit name for Reddit, channel for YouTube, etc.)',
            ),
        ),
    ]
