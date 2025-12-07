"""
Service for feed management operations.
"""

import importlib
import inspect
import logging
from typing import Any

from django.core.cache import cache
from django.db.models import Count, Exists, OuterRef

from aggregators import get_aggregator_by_id
from core.models import Feed
from core.services.base import (
    BaseService,
    NotFoundError,
    PermissionDeniedError,
    ValidationError,
)
from core.services.feed_discovery_service import FeedDiscoveryService
from core.services.icon_service import IconService
from core.services.user_access_service import UserAccessService

logger = logging.getLogger(__name__)


class FeedService(BaseService):
    """
    Service for managing feeds.

    Handles CRUD operations, validation, aggregator loading, and feed management.
    """

    def __init__(self):
        """Initialize the service."""
        super().__init__()
        self.user_access_service = UserAccessService()
        self.icon_service = IconService()
        self.discovery_service = FeedDiscoveryService()

    def create_feed(self, user, data: dict) -> Feed:
        """
        Create a new feed.

        Args:
            user: User creating the feed
            data: Feed data dictionary

        Returns:
            Created Feed object

        Raises:
            ValidationError: If feed data is invalid
        """
        # Determine user ownership (superusers can create shared feeds)
        feed_user = None if user.is_superuser else user

        feed = Feed.objects.create(
            user=feed_user,
            name=data["name"],
            identifier=data["identifier"],
            feed_type=data.get("feed_type", "article"),
            icon=data.get("icon") or None,
            aggregator=data.get("aggregator", "full_website"),
            enabled=data.get("enabled", True),
            generate_title_image=data.get("generate_title_image", True),
            add_source_footer=data.get("add_source_footer", True),
            skip_duplicates=data.get("skip_duplicates", True),
            use_current_timestamp=data.get("use_current_timestamp", True),
            daily_post_limit=data.get("daily_post_limit", 50),
            aggregator_options=data.get("aggregator_options", {}),
        )

        self.logger.info(
            f"Created feed '{feed.name}' (ID: {feed.id}) by user {user.username}"
        )

        # Invalidate statistics cache for all users (feed count changed)
        # Clear cache for anonymous and this user
        cache.delete("statistics_anonymous")
        if user.is_authenticated:
            cache.delete(f"statistics_{user.id}")

        # Queue icon fetch as background task
        self._queue_icon_fetch(feed)

        return feed

    def update_feed(self, feed_id: int, user, data: dict) -> Feed:
        """
        Update an existing feed.

        Args:
            feed_id: Feed ID
            user: User updating the feed
            data: Updated feed data

        Returns:
            Updated Feed object

        Raises:
            NotFoundError: If feed not found
            PermissionDeniedError: If user cannot update feed
        """
        queryset = self.user_access_service.filter_feeds_queryset(
            Feed.objects.all(), user
        )
        feed = queryset.filter(id=feed_id).first()

        if not feed:
            raise NotFoundError(f"Feed with ID {feed_id} not found")

        # Check if user can modify this feed (only owner or superuser)
        if feed.user != user and not user.is_superuser:
            raise PermissionDeniedError(
                f"User {user.username} cannot modify feed {feed_id}"
            )

        # Update fields if provided
        update_fields = []
        if "name" in data:
            feed.name = data["name"]
            update_fields.append("name")
        if "enabled" in data:
            feed.enabled = data["enabled"]
            update_fields.append("enabled")
        if "generate_title_image" in data:
            feed.generate_title_image = data["generate_title_image"]
            update_fields.append("generate_title_image")
        if "add_source_footer" in data:
            feed.add_source_footer = data["add_source_footer"]
            update_fields.append("add_source_footer")
        if "skip_duplicates" in data:
            feed.skip_duplicates = data["skip_duplicates"]
            update_fields.append("skip_duplicates")
        if "use_current_timestamp" in data:
            feed.use_current_timestamp = data["use_current_timestamp"]
            update_fields.append("use_current_timestamp")
        if "daily_post_limit" in data:
            feed.daily_post_limit = data["daily_post_limit"]
            update_fields.append("daily_post_limit")
        if "aggregator_options" in data:
            feed.aggregator_options = data["aggregator_options"]
            update_fields.append("aggregator_options")
        if "icon" in data:
            feed.icon = data["icon"]
            update_fields.append("icon")

        if update_fields:
            feed.save(update_fields=update_fields)

        self.logger.info(
            f"Updated feed '{feed.name}' (ID: {feed.id}) by user {user.username}"
        )

        return feed

    def delete_feed(self, feed_id: int, user) -> None:
        """
        Delete a feed and all its articles.

        Args:
            feed_id: Feed ID
            user: User deleting the feed

        Raises:
            NotFoundError: If feed not found
            PermissionDeniedError: If user cannot delete feed
        """
        queryset = self.user_access_service.filter_feeds_queryset(
            Feed.objects.all(), user
        )
        feed = queryset.filter(id=feed_id).first()

        if not feed:
            raise NotFoundError(f"Feed with ID {feed_id} not found")

        # Check if user can delete this feed (only owner or superuser)
        if feed.user != user and not user.is_superuser:
            raise PermissionDeniedError(
                f"User {user.username} cannot delete feed {feed_id}"
            )

        feed_name = feed.name
        feed_user_id = feed.user.id if feed.user else None
        feed.delete()

        self.logger.info(
            f"Deleted feed '{feed_name}' (ID: {feed_id}) by user {user.username}"
        )

        # Invalidate statistics cache (feed count changed)
        cache.delete("statistics_anonymous")
        if feed_user_id:
            cache.delete(f"statistics_{feed_user_id}")
        if user.is_authenticated and user.id != feed_user_id:
            cache.delete(f"statistics_{user.id}")

    def get_feed(self, feed_id: int, user) -> Feed:
        """
        Get a feed by ID with permission check.

        Args:
            feed_id: Feed ID
            user: User requesting the feed

        Returns:
            Feed object

        Raises:
            NotFoundError: If feed not found
            PermissionDeniedError: If user cannot access feed
        """
        queryset = self.user_access_service.filter_feeds_queryset(
            Feed.objects.all(), user
        )
        feed = queryset.filter(id=feed_id).first()

        if not feed:
            raise NotFoundError(f"Feed with ID {feed_id} not found")

        return feed

    def list_feeds(
        self,
        user,
        search: str | None = None,
        feed_type: str | None = None,
        enabled: bool | None = None,
    ) -> list[Feed]:
        """
        List feeds with optional filtering.

        Args:
            user: User requesting feeds
            search: Search query for feed name
            feed_type: Filter by feed type
            enabled: Filter by enabled status

        Returns:
            List of Feed objects with annotated article_count and unread_count
        """
        queryset = self.user_access_service.filter_feeds_queryset(
            Feed.objects.all(), user
        )

        # Apply filters
        if search:
            queryset = queryset.filter(name__icontains=search)
        if feed_type:
            queryset = queryset.filter(feed_type=feed_type)
        if enabled is not None:
            queryset = queryset.filter(enabled=enabled)

        # Annotate with article count
        queryset = queryset.annotate(article_count=Count("articles"))

        # Annotate with unread count if user is authenticated
        if user.is_authenticated:
            from api.models import UserArticleState

            # Count articles that don't have a read state for this user
            read_subquery = UserArticleState.objects.filter(
                user=user,
                article_id=OuterRef("articles__id"),
                is_read=True,
            )
            queryset = queryset.annotate(
                unread_count=Count(
                    "articles",
                    filter=~Exists(read_subquery),
                    distinct=True,
                )
            )
        else:
            # For anonymous users, unread_count = article_count
            queryset = queryset.annotate(unread_count=Count("articles"))

        return list(queryset)

    def preview_feed(self, data: dict) -> dict:
        """
        Preview a feed configuration by fetching the first 2 articles.

        Args:
            data: Feed configuration to test

        Returns:
            Dictionary with preview results
        """
        import os
        from concurrent.futures import ThreadPoolExecutor
        from concurrent.futures import TimeoutError as FuturesTimeoutError

        from django.db import connection

        # Allow Django ORM operations in async context (required for Playwright)
        os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"

        # Close any existing database connections for this thread
        connection.close()

        try:
            # Create a temporary feed instance (not saved to DB)
            temp_feed = Feed(
                name=data["name"],
                identifier=data["identifier"],
                feed_type=data.get("feed_type", "article"),
                icon=data.get("icon", ""),
                aggregator=data.get("aggregator", "full_website"),
                enabled=data.get("enabled", True),
                generate_title_image=data.get("generate_title_image", True),
                add_source_footer=data.get("add_source_footer", True),
                skip_duplicates=False,  # Don't skip duplicates during preview
                use_current_timestamp=data.get("use_current_timestamp", True),
                daily_post_limit=data.get("daily_post_limit", 50),
                aggregator_options=data.get("aggregator_options", {}),
            )

            # Load the aggregator module
            try:
                module = importlib.import_module(f"aggregators.{temp_feed.aggregator}")
            except ModuleNotFoundError:
                return {
                    "success": False,
                    "error": f"Aggregator '{temp_feed.aggregator}' not found",
                    "error_type": "validation",
                }

            # Get the aggregator class instance
            try:
                from aggregators.base import BaseAggregator

                aggregator_class = None
                for attr_name in dir(module):
                    attr = getattr(module, attr_name)
                    if (
                        isinstance(attr, type)
                        and issubclass(attr, BaseAggregator)
                        and attr is not BaseAggregator
                    ):
                        aggregator_class = attr
                        break

                if not aggregator_class:
                    return {
                        "success": False,
                        "error": f"Could not find aggregator class in module '{temp_feed.aggregator}'",
                        "error_type": "validation",
                    }

                aggregator = aggregator_class()
                aggregator.feed = temp_feed
                aggregator.force_refresh = True
                aggregator.runtime_options = data.get("aggregator_options", {})
            except Exception as e:
                self.logger.error(f"Error instantiating aggregator: {e}")
                return {
                    "success": False,
                    "error": f"Could not load aggregator: {str(e)}",
                    "error_type": "validation",
                }

            # Fetch RSS feed with timeout using ThreadPoolExecutor
            try:
                with ThreadPoolExecutor(max_workers=1) as executor:
                    future = executor.submit(
                        aggregator.fetch_rss_feed, temp_feed.identifier
                    )
                    parsed_feed = future.result(timeout=30)
            except FuturesTimeoutError:
                self.logger.warning(f"Feed preview timed out for '{data['name']}'")
                return {
                    "success": False,
                    "error": "Feed preview timed out after 30 seconds. The feed may be too slow or unavailable.",
                    "error_type": "timeout",
                }

            if not parsed_feed or not parsed_feed.entries:
                return {
                    "success": False,
                    "error": "No articles found in the feed. The feed may be empty or the URL may be incorrect.",
                    "error_type": "parse",
                }

            # Process first entry with full content
            preview_articles = []
            for entry in parsed_feed.entries[:1]:
                try:
                    # Parse entry into RawArticle
                    article = aggregator.parse_entry(entry)

                    # Process content (fetch and extract) - show full content
                    content = aggregator.process_article(article, is_first=False)

                    preview_articles.append(
                        {
                            "title": article.title,
                            "content": content,
                            "published": article.date,
                            "author": article.entry.get("author")
                            if article.entry
                            else None,
                            "thumbnail_url": article.thumbnail_url,
                            "link": article.url,
                        }
                    )
                except Exception as e:
                    self.logger.warning(f"Error processing article for preview: {e}")
                    continue

            if not preview_articles:
                return {
                    "success": False,
                    "error": "Could not process any articles from the feed. The feed format may not be supported.",
                    "error_type": "parse",
                }

            return {
                "success": True,
                "articles": preview_articles,
                "count": len(preview_articles),
            }

        except Exception as e:
            self.logger.error(f"Error during feed preview: {e}", exc_info=True)

            # Try to determine error type from exception
            error_msg = str(e).lower()
            if (
                "authentication" in error_msg
                or "unauthorized" in error_msg
                or "forbidden" in error_msg
            ):
                error_type = "authentication"
                error = f"Authentication failed: {str(e)}"
            elif "timeout" in error_msg or "timed out" in error_msg:
                error_type = "timeout"
                error = f"Request timed out: {str(e)}"
            elif "connection" in error_msg or "network" in error_msg:
                error_type = "network"
                error = f"Network error: {str(e)}"
            elif "parse" in error_msg or "xml" in error_msg or "feed" in error_msg:
                error_type = "parse"
                error = f"Could not parse feed: {str(e)}"
            else:
                error_type = "unknown"
                error = f"An error occurred: {str(e)}"

            return {
                "success": False,
                "error": error,
                "error_type": error_type,
            }

    def reload_feed(self, feed_id: int, user, force: bool = False) -> dict:
        """
        Reload a feed (fetch new articles).

        Args:
            feed_id: Feed ID
            user: User requesting reload
            force: If True, force re-download of all articles

        Returns:
            Dictionary with reload statistics

        Raises:
            NotFoundError: If feed not found
            PermissionDeniedError: If user cannot access feed
        """
        from core.services.aggregation_service import AggregationService

        feed = self.get_feed(feed_id, user)

        try:
            options_dict = feed.get_aggregator_options()
            aggregation_service = AggregationService()
            new_articles = aggregation_service.aggregate_feed(
                feed, force_refresh=force, options=options_dict
            )

            self.logger.info(
                f"Reloaded feed '{feed.name}' (ID: {feed_id}): {new_articles} new articles"
            )

            return {
                "success": True,
                "message": f"Feed '{feed.name}' reloaded successfully",
                "articles_added": new_articles,
            }

        except Exception as e:
            self.logger.error(
                f"Error reloading feed '{feed.name}' (ID: {feed_id}): {e}",
                exc_info=True,
            )
            return {
                "success": False,
                "message": f"Error reloading feed: {str(e)}",
                "articles_added": 0,
            }

    def clear_feed_articles(self, feed_id: int, user) -> dict:
        """
        Clear all articles from a feed.

        Args:
            feed_id: Feed ID
            user: User requesting clear

        Returns:
            Dictionary with clear statistics

        Raises:
            NotFoundError: If feed not found
            PermissionDeniedError: If user cannot access feed
        """
        feed = self.get_feed(feed_id, user)

        article_count = feed.articles.count()
        feed.articles.all().delete()

        self.logger.info(
            f"Cleared {article_count} articles from feed '{feed.name}' (ID: {feed_id})"
        )

        return {
            "success": True,
            "message": f"Cleared {article_count} articles from feed '{feed.name}'",
            "feed_id": feed_id,
        }

    def get_feed_aggregator_class(self, feed: Feed):
        """
        Get the aggregator class for a feed.

        If the aggregator cannot be loaded, disables the feed and raises an exception.

        Args:
            feed: Feed object

        Returns:
            Aggregator class

        Raises:
            ValidationError: If aggregator not found or cannot be loaded
        """
        try:
            # Import the aggregator module directly
            module = importlib.import_module(f"aggregators.{feed.aggregator}")

            # Find the BaseAggregator subclass in this module
            for name, obj in inspect.getmembers(module, inspect.isclass):
                if (
                    obj.__module__ == f"aggregators.{feed.aggregator}"
                    and any("BaseAggregator" in str(base) for base in obj.__mro__)
                    and name != "BaseAggregator"
                ):
                    return obj

            raise ValidationError(
                f"No BaseAggregator subclass found in aggregators.{feed.aggregator}"
            )

        except Exception as e:
            # Aggregator failed to load - disable this feed
            self.logger.warning(
                f"Feed '{feed.name}' aggregator '{feed.aggregator}' failed to load: {e}. Disabling feed."
            )
            feed.enabled = False
            feed.save(update_fields=["enabled"])
            raise ValidationError(f"Aggregator failed to load: {str(e)}") from e

    def get_feed_aggregator_metadata(self, feed: Feed) -> dict[str, Any]:
        """
        Get metadata for a feed's aggregator.

        Args:
            feed: Feed object

        Returns:
            Dictionary with aggregator metadata or empty dict if aggregator is broken
        """
        metadata = get_aggregator_by_id(feed.aggregator)
        if metadata:
            return {
                "name": metadata.name,
                "type": metadata.type,
                "description": metadata.description,
                "url": metadata.url,
                "identifier_label": metadata.identifier_label,
            }
        return {}

    def fetch_feed_icon(self, feed: Feed) -> str | None:
        """
        Fetch and update icon for a feed.

        Args:
            feed: Feed object

        Returns:
            Icon URL if fetched successfully, None otherwise
        """
        icon_url = self.icon_service.fetch_feed_icon(feed)
        if icon_url:
            Feed.objects.filter(pk=feed.pk).update(icon=icon_url)
            self.logger.info(f"Set icon for feed '{feed.name}': {icon_url}")
        return icon_url

    def _queue_icon_fetch(self, feed: Feed) -> None:
        """
        Queue icon fetch as background task.

        Args:
            feed: Feed object
        """
        try:
            from django_q.tasks import async_task

            async_task(
                "core.tasks.fetch_feed_favicon",
                feed.pk,
                task_name=f"fetch_favicon_{feed.pk}",
            )
        except ImportError:
            # Django-Q not available, fetch synchronously as fallback
            self.logger.debug("Django-Q not available, fetching icon synchronously")
            icon_url = self.icon_service.fetch_feed_icon(feed)
            if icon_url:
                Feed.objects.filter(pk=feed.pk).update(icon=icon_url)
                self.logger.info(f"Set icon for feed '{feed.name}': {icon_url}")
        except Exception as e:
            self.logger.warning(f"Could not queue icon fetch for '{feed.name}': {e}")
