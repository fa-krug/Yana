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

            # Force reload the specific article by re-fetching its content
            url = article.identifier

            # Use the aggregator to fetch and process the article
            raw_html = aggregator.fetch_article_content(url)
            extracted_content = aggregator.extract_content(raw_html, {
                "name": article.name,
                "identifier": url,
                "author": article.author,
                "date": article.created_at,
            })
            processed_content = aggregator.process_content(extracted_content, {
                "name": article.name,
                "identifier": url,
                "author": article.author,
                "date": article.created_at,
            })

            # Update the article with fresh content
            article.raw_content = raw_html
            article.content = processed_content
            article.save(update_fields=["raw_content", "content"])

            print(f"{'=' * 60}")
            print(f"Article reloaded successfully")
            print(f"Raw content: {len(raw_html)} bytes")
            print(f"Processed content: {len(processed_content)} bytes")
            print(f"{'=' * 60}\n")

            return {
                "success": True,
                "article_id": article_id,
                "article_name": article.name,
                "feed_name": feed.name,
                "aggregator_type": feed.aggregator,
                "message": f"Article reloaded ({len(raw_html)} bytes fetched, {len(processed_content)} bytes processed)",
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
