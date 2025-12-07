# Migration to remove models that were moved to api app
# Tables were already renamed by api.0001_initial

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0005_delete_subreddit_redditpost"),
        ("api", "0001_initial"),
    ]

    operations = [
        # Remove models from core state only - tables were renamed by api migration
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.DeleteModel(name="Group"),
            ],
            database_operations=[],
        ),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.DeleteModel(name="GReaderAuthToken"),
            ],
            database_operations=[],
        ),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.DeleteModel(name="UserArticleState"),
            ],
            database_operations=[],
        ),
    ]
