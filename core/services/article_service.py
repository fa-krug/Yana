"""
Article service for reloading and managing articles.
"""

from typing import Any, Dict

from django.core.exceptions import ObjectDoesNotExist

from ..aggregators import get_aggregator
from ..models import Article


class ArticleService:
    """Service for managing and reloading articles."""

    @staticmethod
    def reload_article(article_id: int) -> Dict[str, Any]:
        """
        Reload a single article by re-fetching and re-processing its content.

        This method:
        1. Fetches the article and its feed
        2. Gets the appropriate aggregator
        3. Re-fetches the article content from the URL
        4. Updates the article with new content

        Args:
            article_id: The ID of the article to reload

        Returns:
            Dictionary with:
                - success: Boolean indicating if reload succeeded
                - article_id: The article ID
                - article_name: The article name
                - feed_name: The feed name
                - aggregator_type: The aggregator type used
                - error: Error message if failed (optional)

        Raises:
            ObjectDoesNotExist: If article with given ID doesn't exist
        """
        try:
            # Get the article
            article = Article.objects.select_related("feed").get(id=article_id)
            feed = article.feed

            # Check if feed is enabled
            if not feed.enabled:
                return {
                    "success": False,
                    "article_id": article_id,
                    "article_name": article.name,
                    "feed_name": feed.name,
                    "aggregator_type": feed.aggregator,
                    "error": "Feed is disabled",
                }

            # Get the aggregator
            aggregator = get_aggregator(feed)

            # Re-fetch and process the article
            print(f"\n{'=' * 60}")
            print(f"Reloading article ID: {article_id}")
            print(f"Article: {article.name}")
            print(f"URL: {article.identifier}")
            print(f"{'=' * 60}")

            # TODO: Implement article-specific reload logic
            # For now, we'll use a simplified approach:
            # The aggregator needs to support fetching a single article by URL
            # This will be implemented when we port the aggregator logic

            # Placeholder: In the TypeScript version, this would:
            # 1. Call aggregator.fetchArticleContentInternal(url)
            # 2. Call aggregator.extractContent(html)
            # 3. Call aggregator.processContent(extracted)
            # 4. Update the article with new content

            # For now, we'll just trigger a full feed aggregation
            # which will update the article if it's still in the feed
            from .aggregator_service import AggregatorService

            result = AggregatorService.trigger_by_feed_id(feed.id)

            if result["success"]:
                print(f"{'=' * 60}")
                print("Article reload completed successfully")
                print(f"{'=' * 60}\n")

                return {
                    "success": True,
                    "article_id": article_id,
                    "article_name": article.name,
                    "feed_name": feed.name,
                    "aggregator_type": feed.aggregator,
                    "message": f"Re-aggregated feed (fetched {result['articles_count']} articles)",
                }
            else:
                return {
                    "success": False,
                    "article_id": article_id,
                    "article_name": article.name,
                    "feed_name": feed.name,
                    "aggregator_type": feed.aggregator,
                    "error": result.get("error", "Unknown error"),
                }

        except ObjectDoesNotExist:
            raise ObjectDoesNotExist(f"Article with ID {article_id} does not exist")
        except Exception as e:
            return {
                "success": False,
                "article_id": article_id,
                "article_name": article.name if "article" in locals() else "Unknown",
                "feed_name": feed.name if "feed" in locals() else "Unknown",
                "aggregator_type": feed.aggregator if "feed" in locals() else "Unknown",
                "error": str(e),
            }
