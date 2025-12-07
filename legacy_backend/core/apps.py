import logging

from django.apps import AppConfig
from django.db.models.signals import post_migrate

logger = logging.getLogger(__name__)


def sync_managed_feeds_after_migrate(sender, **kwargs):
    """
    Signal handler to sync managed feeds after migrations.

    This ensures that Feed records are updated to match the current metadata
    (name, url) from their corresponding managed aggregators.
    """
    from django.core.management import call_command

    logger.info("Post-migration: Syncing managed feeds with aggregator metadata")
    try:
        call_command("sync_managed_feeds", verbosity=0)
        logger.info("Post-migration: Managed feed sync completed successfully")
    except Exception as e:
        logger.warning(f"Post-migration: Could not sync managed feeds: {e}")


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"

    def ready(self):
        """
        Initialize application when Django starts.

        Registers signal handlers for post-migration tasks.
        """
        # Register post_migrate signal to sync managed feeds
        post_migrate.connect(sync_managed_feeds_after_migrate, sender=self)
