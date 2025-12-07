"""
Django management command to aggregate RSS feeds.

This command processes all feeds in the database and collects articles from them.
"""

import logging

from django.core.management.base import BaseCommand, CommandParser

from core.models import Feed
from core.services.aggregation_service import AggregationService

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    """
    Management command to aggregate articles from RSS feeds.

    Usage:
        python manage.py aggregate                    # Aggregate all feeds
        python manage.py aggregate --force            # Force refresh all articles
        python manage.py aggregate --feeds feed1 feed2  # Only aggregate specific feeds
    """

    help = "Aggregate articles from RSS feeds"

    def add_arguments(self, parser: CommandParser) -> None:
        """
        Add command-line arguments.

        Args:
            parser: The argument parser
        """
        parser.add_argument(
            "--force",
            action="store_true",
            help="Force refresh all articles, even if they already exist",
        )
        parser.add_argument(
            "--feeds",
            nargs="+",
            type=str,
            help="Only aggregate specific feeds by name",
        )

    def handle(self, *args, **options) -> None:
        """
        Execute the command.

        Args:
            *args: Positional arguments
            **options: Keyword arguments from argparse
        """
        force_refresh: bool = options.get("force", False)
        feed_names: list[str] = options.get("feeds", [])

        logger.info("=" * 80)
        logger.info("Starting feed aggregation")
        logger.info(f"Force refresh: {force_refresh}")
        if feed_names:
            logger.info(f"Filtering feeds: {', '.join(feed_names)}")
        logger.info("=" * 80)

        # Get feeds to process
        if feed_names:
            feeds = Feed.objects.filter(name__in=feed_names)
            if feeds.count() == 0:
                self.stdout.write(
                    self.style.ERROR(
                        f"No feeds found matching: {', '.join(feed_names)}"
                    )
                )
                return
            if feeds.count() < len(feed_names):
                found_names = list(feeds.values_list("name", flat=True))
                missing = set(feed_names) - set(found_names)
                self.stdout.write(
                    self.style.WARNING(f"Some feeds not found: {', '.join(missing)}")
                )
        else:
            feeds = Feed.objects.all()

        if not feeds.exists():
            self.stdout.write(self.style.WARNING("No feeds found in database"))
            logger.warning("No feeds found in database")
            return

        self.stdout.write(f"Processing {feeds.count()} feed(s)...")
        logger.info(f"Processing {feeds.count()} feed(s)")

        total_new_articles = 0
        successful_feeds = 0
        failed_feeds = 0

        # Process each feed
        aggregation_service = AggregationService()
        for feed in feeds:
            try:
                self.stdout.write(f"\n{'-' * 80}")
                self.stdout.write(f"Processing feed: {feed.name}")
                self.stdout.write(f"Identifier: {feed.identifier}")
                self.stdout.write(f"Aggregator: {feed.aggregator}")
                logger.info(f"Processing feed: {feed.name} (ID: {feed.id})")

                # Get aggregator options
                options_dict = feed.get_aggregator_options()

                # Execute aggregation using service
                new_articles = aggregation_service.aggregate_feed(
                    feed, force_refresh, options_dict
                )

                total_new_articles += new_articles
                successful_feeds += 1

                self.stdout.write(
                    self.style.SUCCESS(
                        f"✓ Successfully processed {feed.name}: {new_articles} new articles"
                    )
                )
                logger.info(
                    f"Successfully processed feed {feed.name}: {new_articles} new articles"
                )

            except Exception as e:
                failed_feeds += 1
                self.stdout.write(
                    self.style.ERROR(f"✗ Error processing feed {feed.name}: {e}")
                )
                logger.error(f"Error processing feed {feed.name}: {e}", exc_info=True)
                continue

        # Print summary
        self.stdout.write(f"\n{'=' * 80}")
        self.stdout.write(self.style.SUCCESS("Aggregation complete!"))
        self.stdout.write(f"Total feeds processed: {successful_feeds}/{feeds.count()}")
        self.stdout.write(f"Failed feeds: {failed_feeds}")
        self.stdout.write(f"Total new articles: {total_new_articles}")
        self.stdout.write(f"{'=' * 80}")

        logger.info("=" * 80)
        logger.info(
            f"Aggregation complete: {successful_feeds}/{feeds.count()} successful, {failed_feeds} failed"
        )
        logger.info(f"Total new articles: {total_new_articles}")
        logger.info("=" * 80)
