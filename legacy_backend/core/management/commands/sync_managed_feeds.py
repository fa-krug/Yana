"""
Django management command to sync managed feeds with their aggregator metadata.

This command updates Feed records to match the current metadata (name, url, description)
defined in their corresponding managed aggregators.
"""

import logging

from django.core.management.base import BaseCommand

from aggregators import get_all_aggregators
from core.models import Feed

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    """
    Management command to sync managed feeds with their aggregator metadata.

    Usage:
        python manage.py sync_managed_feeds                # Sync all managed feeds
        python manage.py sync_managed_feeds --dry-run      # Preview changes without applying
    """

    help = "Sync managed feeds with their aggregator metadata"

    def add_arguments(self, parser) -> None:
        """
        Add command-line arguments.

        Args:
            parser: The argument parser
        """
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview changes without applying them",
        )

    def handle(self, *args, **options) -> None:
        """
        Execute the command.

        Args:
            *args: Positional arguments
            **options: Keyword arguments from argparse
        """
        dry_run: bool = options.get("dry_run", False)

        if dry_run:
            self.stdout.write(
                self.style.WARNING("DRY RUN MODE - No changes will be saved")
            )
            logger.info("Running in dry-run mode")

        logger.info("=" * 80)
        logger.info("Starting managed feed sync")
        logger.info("=" * 80)

        # Discover all managed aggregators
        all_aggregators = get_all_aggregators()
        managed_aggregators = [agg for agg in all_aggregators if agg.type == "managed"]

        if not managed_aggregators:
            self.stdout.write(self.style.WARNING("No managed aggregators found"))
            logger.warning("No managed aggregators found")
            return

        self.stdout.write(f"Found {len(managed_aggregators)} managed aggregator(s)")
        logger.info(f"Found {len(managed_aggregators)} managed aggregators")

        total_synced = 0
        total_changes = 0

        # Process each managed aggregator
        for agg_metadata in managed_aggregators:
            # Find all feeds using this aggregator
            feeds = Feed.objects.filter(aggregator=agg_metadata.id)

            if not feeds.exists():
                continue

            self.stdout.write(f"\n{'-' * 80}")
            self.stdout.write(
                f"Aggregator: {agg_metadata.name} (ID: {agg_metadata.id})"
            )
            self.stdout.write(f"Feeds using this aggregator: {feeds.count()}")
            logger.info(
                f"Processing aggregator {agg_metadata.name} (ID: {agg_metadata.id}): {feeds.count()} feed(s)"
            )

            # Sync each feed
            for feed in feeds:
                changes = []

                # Check name
                if feed.name != agg_metadata.name:
                    changes.append(f"name: '{feed.name}' → '{agg_metadata.name}'")
                    if not dry_run:
                        feed.name = agg_metadata.name

                # Check identifier (URL for managed feeds)
                if feed.identifier != agg_metadata.url:
                    changes.append(
                        f"identifier: '{feed.identifier}' → '{agg_metadata.url}'"
                    )
                    if not dry_run:
                        feed.identifier = agg_metadata.url

                # Check description (stored in example field for historical reasons)
                # Only update if the field is being used differently now
                # For now, we'll skip example field to avoid overwriting user data

                if changes:
                    total_synced += 1
                    total_changes += len(changes)

                    self.stdout.write(f"  Feed ID {feed.id}:")
                    for change in changes:
                        self.stdout.write(f"    • {change}")
                        logger.info(f"Feed {feed.id}: {change}")

                    if not dry_run:
                        feed.save(update_fields=["name", "url", "updated_at"])
                        self.stdout.write(
                            self.style.SUCCESS(f"    ✓ Updated feed ID {feed.id}")
                        )
                        logger.info(f"Updated feed {feed.id}")

        # Print summary
        self.stdout.write(f"\n{'=' * 80}")
        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"DRY RUN: Would update {total_synced} feed(s) with {total_changes} change(s)"
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Sync complete: Updated {total_synced} feed(s) with {total_changes} change(s)"
                )
            )
        self.stdout.write(f"{'=' * 80}")

        logger.info("=" * 80)
        logger.info(
            f"Managed feed sync complete: {total_synced} feed(s) updated with {total_changes} change(s)"
        )
        logger.info("=" * 80)
