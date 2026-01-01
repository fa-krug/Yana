"""Management command to test aggregators."""

from django.core.management.base import BaseCommand
from core.models import Feed
from core.services.aggregator_service import AggregatorService


class Command(BaseCommand):
    help = "Test aggregator for a specific feed"

    def add_arguments(self, parser):
        parser.add_argument("feed_id", type=int, help="Feed ID to test")

    def handle(self, *args, **options):
        feed_id = options["feed_id"]

        self.stdout.write(f"Testing aggregator for feed ID: {feed_id}")

        try:
            feed = Feed.objects.get(id=feed_id)
            self.stdout.write(f"Feed: {feed.name} ({feed.aggregator})")
            self.stdout.write(f"Identifier: {feed.identifier}")
            self.stdout.write(f"Daily limit: {feed.daily_limit}")
            self.stdout.write("")

            result = AggregatorService.trigger_by_feed_id(feed_id)

            if result["success"]:
                self.stdout.write(
                    self.style.SUCCESS(f"✓ Success! Aggregated {result['articles_count']} articles")
                )
            else:
                self.stdout.write(self.style.ERROR(f"✗ Failed: {result.get('error', 'Unknown error')}"))
        except Feed.DoesNotExist:
            self.stdout.write(self.style.ERROR(f"✗ Feed with ID {feed_id} does not exist"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"✗ Error: {e}"))
