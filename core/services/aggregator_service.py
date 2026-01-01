"""
Aggregator service for triggering feed aggregators.
"""

from typing import Any, Dict, List, Optional

from django.core.exceptions import ObjectDoesNotExist

from ..aggregators import get_aggregator
from ..models import Feed, Article


class AggregatorService:
    """Service for managing and triggering aggregators."""

    @staticmethod
    def trigger_by_feed_id(feed_id: int) -> Dict[str, Any]:
        """
        Trigger aggregator for a specific feed by its ID.

        Args:
            feed_id: The ID of the feed to aggregate

        Returns:
            Dictionary with:
                - success: Boolean indicating if aggregation succeeded
                - feed_id: The feed ID
                - feed_name: The feed name
                - aggregator_type: The aggregator type used
                - articles_count: Number of articles aggregated
                - error: Error message if failed (optional)

        Raises:
            ObjectDoesNotExist: If feed with given ID doesn't exist
        """
        try:
            # Get the feed
            feed = Feed.objects.get(id=feed_id)

            # Check if feed is enabled
            if not feed.enabled:
                return {
                    "success": False,
                    "feed_id": feed_id,
                    "feed_name": feed.name,
                    "aggregator_type": feed.aggregator,
                    "articles_count": 0,
                    "error": "Feed is disabled",
                }

            # Get the aggregator
            aggregator = get_aggregator(feed)

            # Trigger aggregation
            print(f"\n{'=' * 60}")
            print(f"Triggering aggregator for feed ID: {feed_id}")
            print(f"{'=' * 60}")

            articles_data = aggregator.aggregate()

            # Save articles to database
            created_count = 0
            for article_data in articles_data:
                try:
                    # Get or create article by identifier
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
                    print(f"Warning: Failed to save article: {e}")

            print(f"{'=' * 60}")
            print(f"Aggregation completed successfully")
            print(f"Created {created_count} new articles")
            print(f"{'=' * 60}\n")

            return {
                "success": True,
                "feed_id": feed_id,
                "feed_name": feed.name,
                "aggregator_type": feed.aggregator,
                "articles_count": created_count,
            }

        except ObjectDoesNotExist as e:
            raise ObjectDoesNotExist(f"Feed with ID {feed_id} does not exist") from e
        except Exception as e:
            return {
                "success": False,
                "feed_id": feed_id,
                "feed_name": feed.name if "feed" in locals() else "Unknown",
                "aggregator_type": feed.aggregator if "feed" in locals() else "Unknown",
                "articles_count": 0,
                "error": str(e),
            }

    @staticmethod
    def trigger_by_aggregator_type(
        aggregator_type: str, limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Trigger all feeds of a specific aggregator type.

        Args:
            aggregator_type: The aggregator type (e.g., 'youtube', 'reddit')
            limit: Optional limit on number of feeds to process

        Returns:
            List of result dictionaries from trigger_by_feed_id
        """
        feeds = Feed.objects.filter(aggregator=aggregator_type, enabled=True)

        if limit:
            feeds = feeds[:limit]

        results = []
        for feed in feeds:
            result = AggregatorService.trigger_by_feed_id(feed.id)
            results.append(result)

        return results

    @staticmethod
    def trigger_all(limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Trigger all enabled feeds.

        Args:
            limit: Optional limit on number of feeds to process

        Returns:
            List of result dictionaries from trigger_by_feed_id
        """
        feeds = Feed.objects.filter(enabled=True)

        if limit:
            feeds = feeds[:limit]

        results = []
        for feed in feeds:
            result = AggregatorService.trigger_by_feed_id(feed.id)
            results.append(result)

        return results
