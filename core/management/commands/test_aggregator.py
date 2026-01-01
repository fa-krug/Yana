"""Management command to test aggregators."""

import traceback

from django.core.management.base import BaseCommand

from core.aggregators import get_aggregator
from core.models import Article, Feed


class Command(BaseCommand):
    help = "Test aggregator for a specific feed"

    def add_arguments(self, parser):
        parser.add_argument("feed_id", type=int, help="Feed ID to test")
        parser.add_argument(
            "--dry-run", action="store_true", help="Don't save articles to database"
        )
        parser.add_argument(
            "--verbose", action="store_true", help="Show full content and tracebacks on errors"
        )
        parser.add_argument(
            "--first", type=int, default=1, help="Number of first articles to show details for"
        )

    def handle(self, *args, **options):
        feed_id = options["feed_id"]
        dry_run = options.get("dry_run", False)
        verbose = options.get("verbose", False)
        num_first = options.get("first", 1)

        self.stdout.write(f"Testing aggregator for feed ID: {feed_id}")
        if dry_run:
            self.stdout.write(self.style.WARNING("(DRY RUN - no articles will be saved)"))

        try:
            feed = Feed.objects.get(id=feed_id)
            self.stdout.write(f"Feed: {feed.name} ({feed.aggregator})")
            self.stdout.write(f"Identifier: {feed.identifier}")
            self.stdout.write(f"Daily limit: {feed.daily_limit}")
            self.stdout.write("")

            # Get aggregator and run it
            aggregator = get_aggregator(feed)

            # Set up logging to capture errors
            import logging

            logging.basicConfig(level=logging.DEBUG if verbose else logging.WARNING)

            articles_data = aggregator.aggregate()

            self.stdout.write(
                self.style.SUCCESS(f"✓ Aggregator returned {len(articles_data)} articles")
            )

            # Show details for first N articles
            for idx, article_data in enumerate(articles_data[:num_first], 1):
                self.stdout.write(f"\nArticle {idx}:")
                self.stdout.write(f"  Name: {article_data.get('name')[:80]}")
                self.stdout.write(f"  URL: {article_data.get('identifier')}")
                self.stdout.write(f"  Content length: {len(article_data.get('content', ''))} chars")
                self.stdout.write(
                    f"  Raw content length: {len(article_data.get('raw_content', ''))} chars"
                )

                if verbose:
                    self.stdout.write("\n  >>> RAW CONTENT (first 500 chars):")
                    raw = article_data.get("raw_content", "")[:500]
                    self.stdout.write(f"  {raw}...")

                    self.stdout.write("\n  >>> PROCESSED CONTENT (first 500 chars):")
                    content = article_data.get("content", "")[:500]
                    self.stdout.write(f"  {content}...")

            if not dry_run:
                # Save to database
                created_count = 0
                for article_data in articles_data:
                    try:
                        article, created = Article.objects.get_or_create(
                            feed=feed,
                            identifier=article_data["identifier"],
                            defaults={
                                "name": article_data.get("name", ""),
                                "raw_content": article_data.get("raw_content", ""),
                                "content": article_data.get("content", ""),
                                "date": article_data.get("date"),
                                "author": article_data.get("author", ""),
                                "icon": article_data.get("icon"),
                            },
                        )
                        if created:
                            created_count += 1
                    except Exception as e:
                        self.stdout.write(
                            self.style.WARNING(f"Warning: Failed to save article: {e}")
                        )

                self.stdout.write(f"\nCreated {created_count} new articles in database")

        except Feed.DoesNotExist:
            self.stdout.write(self.style.ERROR(f"✗ Feed with ID {feed_id} does not exist"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"✗ Error: {e}"))
            if verbose:
                self.stdout.write("\nFull traceback:")
                traceback.print_exc()
