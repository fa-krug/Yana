"""
Service for feed aggregation orchestration.
"""

import contextlib
import logging
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

from django.conf import settings
from django.db import connection
from django.utils import timezone

from core.models import Article, Feed
from core.services.base import BaseService

logger = logging.getLogger(__name__)

# Default number of parallel workers for aggregation
DEFAULT_AGGREGATION_WORKERS = 4


class AggregationService(BaseService):
    """
    Service for orchestrating feed aggregation.

    Handles single feed aggregation, parallel aggregation of multiple feeds,
    and article reloading.
    """

    def __init__(self):
        """Initialize the service."""
        super().__init__()
        self.max_workers = getattr(
            settings, "AGGREGATION_WORKERS", DEFAULT_AGGREGATION_WORKERS
        )

    def aggregate_feed(
        self,
        feed: Feed,
        force_refresh: bool = False,
        options: dict | None = None,
        article_limit: int | None = None,
    ) -> int:
        """
        Aggregate a single feed.

        Args:
            feed: Feed object to aggregate
            force_refresh: If True, re-download existing articles
            options: Aggregator options dictionary
            article_limit: Maximum number of articles to process (None = no limit)

        Returns:
            Number of new articles added

        Raises:
            NotFoundError: If feed aggregator cannot be loaded
        """

        # Allow Django ORM operations in async context (required for Playwright)
        os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"

        # Close any existing database connections for this thread
        connection.close()

        try:
            if not feed.aggregator:
                self.logger.warning(f"Feed {feed.name} has no aggregator configured")
                return 0

            # Get aggregator class and instantiate (auto-disables feed on failure)
            from core.services.feed_service import FeedService

            feed_service = FeedService()
            aggregator_class = feed_service.get_feed_aggregator_class(feed)
            aggregator = aggregator_class()

            # Get aggregator options
            options_dict = options or feed.get_aggregator_options()

            # Run aggregation
            new_count = aggregator.aggregate(
                feed, force_refresh, options_dict, article_limit
            )
            self.logger.info(f"Feed {feed.name}: {new_count} new articles")
            return new_count

        except Exception as e:
            self.logger.error(f"Error aggregating feed {feed.name}: {str(e)}")
            raise

    def aggregate_all_feeds(self) -> dict:
        """
        Aggregate all enabled feeds in parallel.

        Uses ThreadPoolExecutor to aggregate multiple feeds concurrently.
        Only aggregates feeds where enabled=True.

        Returns:
            Dictionary with aggregation results
        """
        results = {
            "feeds": {},
            "total_new_articles": 0,
            "errors": [],
        }

        # Get all enabled feed IDs
        feed_ids = list(Feed.objects.filter(enabled=True).values_list("id", flat=True))

        self.logger.info(
            f"Starting parallel aggregation for {len(feed_ids)} enabled feeds "
            f"with {self.max_workers} workers"
        )

        # Aggregate RSS feeds in parallel
        if feed_ids:
            with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
                # Submit all feed aggregation tasks
                future_to_feed = {
                    executor.submit(self._aggregate_feed_worker, feed_id): feed_id
                    for feed_id in feed_ids
                }

                # Collect results as they complete
                for future in as_completed(future_to_feed):
                    feed_name, new_count, error = future.result()
                    if error:
                        results["errors"].append(error)
                    else:
                        results["feeds"][feed_name] = new_count
                        results["total_new_articles"] += new_count

        self.logger.info(
            f"Parallel aggregation complete: {results['total_new_articles']} new articles"
        )

        return results

    def aggregate_feeds(self, feed_ids: list[int], force_refresh: bool = False) -> dict:
        """
        Aggregate specific feeds by ID.

        Args:
            feed_ids: List of feed IDs to aggregate
            force_refresh: If True, force re-download of all articles

        Returns:
            Dictionary with aggregation results
        """
        results = {
            "feeds": {},
            "total_new_articles": 0,
            "errors": [],
        }

        feeds = Feed.objects.filter(id__in=feed_ids, enabled=True)

        for feed in feeds:
            try:
                options_dict = feed.get_aggregator_options()
                new_count = self.aggregate_feed(feed, force_refresh, options_dict)
                results["feeds"][feed.name] = new_count
                results["total_new_articles"] += new_count
            except Exception as e:
                error_msg = f"Error aggregating feed {feed.name}: {str(e)}"
                results["errors"].append(error_msg)
                self.logger.error(error_msg)

        return results

    def reload_article(self, article: Article) -> bool:
        """
        Refetch a single article by re-fetching and extracting its content.

        Args:
            article: Article object to reload

        Returns:
            True if refetch was successful, False otherwise
        """

        from aggregators.base import RawArticle

        # Allow Django ORM operations in async context (required for Playwright)
        os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"

        # Close any existing database connections for this thread
        connection.close()

        feed = article.feed

        # Handle Reddit articles differently - they need the Reddit aggregator
        if feed.feed_type == "reddit":
            return self._reload_reddit_article(article)

        try:
            if not feed.aggregator:
                self.logger.warning(f"Feed {feed.name} has no aggregator configured")
                return False

            # Get aggregator class and instantiate
            from core.services.feed_service import FeedService

            feed_service = FeedService()
            aggregator_class = feed_service.get_feed_aggregator_class(feed)
            aggregator = aggregator_class()

            # Set up aggregator context
            aggregator.feed = feed
            aggregator.force_refresh = True
            aggregator.runtime_options = feed.get_aggregator_options()

            self.logger.info(f"Refetching article: {article.name}")

            # Create RawArticle from existing article data
            raw_article = RawArticle(
                url=article.url,
                title=article.name,
                date=article.date,
                content="",  # Will be fetched from web, not used during refetch
                entry=None,  # Not needed for refetch, only used during initial RSS parsing
                html="",
            )

            # Fetch and process content
            content = aggregator.process_article(raw_article)

            # Update the article in database
            article.content = content
            article.save(update_fields=["content"])

            self.logger.info(f"Successfully refetched article: {article.name}")
            return True

        except Exception as e:
            self.logger.error(
                f"Error refetching article {article.name}: {str(e)}", exc_info=True
            )
            return False

    def _aggregate_feed_worker(self, feed_id: int) -> tuple[str, int, str | None]:
        """
        Worker function to aggregate a single feed.

        Args:
            feed_id: The ID of the feed to aggregate

        Returns:
            Tuple of (feed_name, new_count, error_message or None)
        """

        # Allow Django ORM operations in ThreadPoolExecutor workers
        os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"

        # Close any existing database connections for this thread
        connection.close()

        try:
            feed = Feed.objects.get(id=feed_id)
            feed_name = feed.name

            if not feed.aggregator:
                self.logger.warning(f"Feed {feed_name} has no aggregator configured")
                return (feed_name, 0, None)

            # Get aggregator class and instantiate (auto-disables feed on failure)
            from core.services.feed_service import FeedService

            feed_service = FeedService()
            aggregator_class = feed_service.get_feed_aggregator_class(feed)
            aggregator = aggregator_class()

            # Get aggregator options
            options_dict = feed.get_aggregator_options()

            # Run aggregation (force_refresh=False for scheduled runs)
            new_count = aggregator.aggregate(
                feed, force_refresh=False, options=options_dict, article_limit=None
            )
            self.logger.info(f"Feed {feed_name}: {new_count} new articles")
            return (feed_name, new_count, None)

        except Feed.DoesNotExist:
            return (f"Feed ID {feed_id}", 0, f"Feed with ID {feed_id} not found")
        except Exception as e:
            feed_name = f"Feed ID {feed_id}"
            with contextlib.suppress(Exception):
                feed_name = Feed.objects.get(id=feed_id).name
            error_msg = f"Error aggregating feed {feed_name}: {str(e)}"
            self.logger.error(error_msg)
            return (feed_name, 0, error_msg)

    def _reload_reddit_article(self, article: Article) -> bool:
        """
        Refetch a Reddit article by re-fetching from Reddit API.

        Args:
            article: The Article object to refetch (must be a Reddit article)

        Returns:
            True if refetch was successful, False otherwise
        """
        from datetime import datetime

        from aggregators.base import RawArticle
        from aggregators.reddit import RedditAggregator

        try:
            feed = article.feed
            aggregator = RedditAggregator()

            # Set up aggregator context
            aggregator.feed = feed
            aggregator.force_refresh = True
            aggregator.runtime_options = feed.get_aggregator_options()

            self.logger.info(f"Refetching Reddit article: {article.name}")

            # Get Reddit client and fetch the submission
            reddit = aggregator.get_reddit_client()

            # Use external_id if available, otherwise try to extract from URL
            reddit_id = article.external_id
            if not reddit_id:
                # Try to extract from URL (format: https://reddit.com/r/subreddit/comments/ID/...)
                import re

                match = re.search(r"/comments/([a-zA-Z0-9]+)/", article.url)
                if match:
                    reddit_id = match.group(1)

            if not reddit_id:
                self.logger.error(
                    f"Could not determine Reddit ID for article: {article.name}"
                )
                return False

            submission = reddit.submission(id=reddit_id)

            # Refresh submission data
            submission._fetch()

            # Build content with comments
            content = aggregator.build_post_content(submission)

            # Parse creation date
            post_date = timezone.make_aware(
                datetime.fromtimestamp(submission.created_utc)
            )

            # Create RawArticle for standardization
            permalink = f"https://reddit.com{submission.permalink}"
            raw_article = RawArticle(
                url=permalink,
                title=submission.title,
                date=post_date,
                content=content,
                entry={},
            )

            # Extract thumbnail URL and header image URL
            thumbnail_url = aggregator._extract_thumbnail_url(submission)
            header_image_url = aggregator._get_header_image_url(submission)

            # Standardize content format
            raw_article.html = content
            aggregator.standardize_format(
                raw_article, header_image_url=header_image_url
            )

            # Update the article in database
            author = submission.author.name if submission.author else "[deleted]"
            article.name = submission.title[:500]
            article.url = permalink
            article.author = author
            article.score = submission.score
            article.date = post_date
            article.content = raw_article.html
            article.thumbnail_url = thumbnail_url or ""
            article.save(
                update_fields=[
                    "name",
                    "url",
                    "author",
                    "score",
                    "date",
                    "content",
                    "thumbnail_url",
                ]
            )

            self.logger.info(f"Successfully refetched Reddit article: {article.name}")
            return True

        except Exception as e:
            self.logger.error(
                f"Error refetching Reddit article {article.name}: {str(e)}",
                exc_info=True,
            )
            return False
