"""
Base aggregator class combining all mixins.

This module provides the BaseAggregator abstract base class that all aggregators
must inherit from. It combines all mixin functionality and orchestrates the
complete aggregation workflow.
"""

import logging
from abc import ABC, abstractmethod
from datetime import UTC, datetime
from typing import Any

from django.utils import timezone

from .daily_limit import DailyLimitMixin
from .exceptions import ContentFetchError
from .extract import ExtractionMixin
from .fetch import FetchMixin, fetch_feed
from .models import RawArticle
from .options import OptionsMixin
from .process import ProcessingMixin
from .utils import extract_entry_content, should_skip_article

logger = logging.getLogger(__name__)


class BaseAggregator(
    ABC, OptionsMixin, FetchMixin, ExtractionMixin, ProcessingMixin, DailyLimitMixin
):
    """
    Abstract base class for all aggregators.

    Each aggregator MUST subclass this and define the required metadata properties.
    All methods have sensible defaults, override only what you need to customize.

    Required attributes (enforced by ABC - must define in subclass):
        - id: Unique identifier for this aggregator (e.g., "full_website", "heise")
        - type: "custom" or "managed"
        - name: Human-readable name
        - url: Example feed URL
        - description: What this aggregator does

    Optional attributes (can override in subclass):
        - options: Configuration schema (dict)
        - selectors_to_remove: CSS selectors for unwanted elements (list)
        - wait_for_selector: CSS selector to wait for when loading (str)
        - fetch_timeout: Playwright timeout in milliseconds (int)
    """

    # ============================================================================
    # METADATA - MUST define in subclass (enforced by ABC)
    # ============================================================================

    @property
    @abstractmethod
    def id(self) -> str:
        """Unique identifier for this aggregator (e.g., 'full_website', 'heise'). MUST override."""
        pass

    @property
    @abstractmethod
    def type(self) -> str:
        """Type of aggregator: 'custom' or 'managed'. MUST override."""
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable name. MUST override."""
        pass

    @property
    @abstractmethod
    def url(self) -> str:
        """Example feed URL. MUST override."""
        pass

    @property
    @abstractmethod
    def description(self) -> str:
        """Description of what this aggregator does. MUST override."""
        pass

    # ============================================================================
    # INITIALIZATION
    # ============================================================================

    def __init__(self):
        """Initialize aggregator instance."""
        self.feed: Any = None  # Feed model instance
        self.force_refresh: bool = False
        self.runtime_options: dict[str, Any] = {}
        self.logger = logging.getLogger(f"aggregators.{self.__class__.__name__}")

        # Validate required metadata on instantiation
        try:
            _ = self.id
            _ = self.type
            _ = self.name
            _ = self.url
            _ = self.description
        except NotImplementedError as e:
            raise NotImplementedError(
                f"Aggregator {self.__class__.__name__} must override required metadata: {e}"
            ) from e

    # ============================================================================
    # MAIN ENTRY POINT - Rarely needs overriding
    # ============================================================================

    def aggregate(
        self,
        feed: Any,
        force_refresh: bool = False,
        options: dict | None = None,
        article_limit: int | None = None,
    ) -> int:
        """
        Main aggregation entry point.

        This orchestrates the entire aggregation process. You rarely need to
        override this - instead, override the individual step methods below.

        Args:
            feed: The Feed object to aggregate
            force_refresh: Whether to re-download existing articles
            options: Dictionary of aggregator-specific options
            article_limit: Maximum number of articles to process (None = no limit)

        Returns:
            Number of new articles added
        """
        self.feed = feed
        self.force_refresh = force_refresh
        self.runtime_options = options or {}

        self.logger.info(f"Starting aggregation for feed: {feed.name}")
        self.on_aggregation_start()

        # Fetch RSS feed
        parsed_feed = self.fetch_rss_feed(feed.identifier)

        if not parsed_feed.entries:
            self.logger.warning(f"No entries found in feed {feed.name}")
            return 0

        # Apply article limit if specified
        entries_to_process = parsed_feed.entries
        if article_limit is not None and article_limit > 0:
            entries_to_process = parsed_feed.entries[:article_limit]
            self.logger.info(f"Limiting aggregation to first {article_limit} articles")

        new_articles_count = 0
        skipped_count = 0

        # Process each entry
        for index, entry in enumerate(entries_to_process):
            try:
                # Parse entry into RawArticle
                article = self.parse_entry(entry)

                # Check if should skip
                should_skip, skip_reason = self.should_skip_article(article)
                if should_skip:
                    if skip_reason:
                        self.logger.info(skip_reason)
                    continue

                self.logger.info(
                    f"Processing [{index + 1}/{len(entries_to_process)}]: {article.title}"
                )

                # Fetch and process content
                content = self.process_article(article, is_first=(index == 0))

                # Save to database
                created = self.save_article(article, content)

                if created:
                    new_articles_count += 1
                    self.on_article_created(article)

            except ContentFetchError as e:
                skipped_count += 1
                # Get article title from entry if article not yet parsed
                article_title = entry.get("title", "unknown")
                self.logger.warning(f"Skipping article '{article_title}': {e}")
                self.on_article_error(entry, e)
                continue

            except Exception as e:
                self.logger.error(f"Error processing entry {index}: {e}", exc_info=True)
                self.on_article_error(entry, e)
                continue

        self.on_aggregation_complete(new_articles_count)
        if skipped_count > 0:
            self.logger.info(
                f"Completed {feed.name}: {new_articles_count} new articles, {skipped_count} skipped (content fetch failed)"
            )
        else:
            self.logger.info(
                f"Completed {feed.name}: {new_articles_count} new articles"
            )

        return new_articles_count

    # ============================================================================
    # STEP 1: FETCH RSS FEED
    # ============================================================================

    def fetch_rss_feed(self, feed_url: str) -> Any:
        """
        Fetch and parse the RSS feed.

        Override this if you need custom feed fetching logic.

        Args:
            feed_url: URL of the RSS feed

        Returns:
            Parsed feed object (feedparser.FeedParserDict)
        """
        return fetch_feed(feed_url)

    # ============================================================================
    # STEP 2: PARSE ENTRY
    # ============================================================================

    def parse_entry(self, entry: Any) -> RawArticle:
        """
        Convert an RSS entry into a RawArticle object.

        Override this if you need to extract data differently from the RSS entry.

        Args:
            entry: feedparser entry object

        Returns:
            RawArticle with parsed data
        """
        article_url = entry.get("link", "")
        article_title = entry.get("title", "Untitled")

        # Extract date from RSS entry, falling back to current time
        article_date = self._parse_entry_date(entry)

        # Extract raw content
        raw_content = extract_entry_content(entry)

        return RawArticle(
            url=article_url,
            title=article_title,
            date=article_date,
            content=raw_content,
            entry=entry,
        )

    def _parse_entry_date(self, entry: Any) -> datetime:
        """
        Parse the publication date from an RSS entry.

        Tries published_parsed first, then updated_parsed, then falls back to now.

        Args:
            entry: feedparser entry object

        Returns:
            Timezone-aware datetime
        """
        from datetime import datetime as dt

        # Try published_parsed first, then updated_parsed
        time_struct = entry.get("published_parsed") or entry.get("updated_parsed")

        if time_struct:
            try:
                # Convert time.struct_time to datetime with UTC timezone
                # RSS feeds are typically UTC
                return dt(*time_struct[:6], tzinfo=UTC)
            except Exception as e:
                self.logger.debug(f"Failed to parse entry date: {e}")

        # Fallback to current time
        return timezone.now()

    # ============================================================================
    # STEP 3: SKIP LOGIC
    # ============================================================================

    def should_skip_article(self, article: RawArticle) -> tuple[bool, str | None]:
        """
        Determine if an article should be skipped.

        Override this to add custom skip logic (e.g., filter by title, URL patterns).

        Args:
            article: The article to check

        Returns:
            Tuple of (should_skip, reason)
            - should_skip: True if article should be skipped
            - reason: Optional log message explaining why
        """
        # Use common skip logic from utils
        should_skip, reason = should_skip_article(article, self.force_refresh)
        if should_skip:
            return should_skip, reason

        # Check for duplicate titles if enabled (skip this check when force_refresh is True)
        if (
            not self.force_refresh
            and self.feed
            and getattr(self.feed, "skip_duplicates", True)
        ):
            from datetime import timedelta

            from core.models import Article

            # Check for articles with the same title in the last 7 days
            seven_days_ago = timezone.now() - timedelta(days=7)
            duplicate_exists = Article.objects.filter(
                feed=self.feed, name=article.title, created_at__gte=seven_days_ago
            ).exists()

            if duplicate_exists:
                return (
                    True,
                    f"Skipping duplicate title from last 7 days: {article.title}",
                )

        return False, None

    # ============================================================================
    # STEP 4: PROCESS ARTICLE (Main Content Pipeline)
    # ============================================================================

    def process_article(self, article: RawArticle, is_first: bool = False) -> str:
        """
        Process an article through the complete content pipeline.

        This orchestrates fetching, extraction, cleaning, and formatting.
        You rarely need to override this - instead, override the individual steps.

        Args:
            article: The article to process
            is_first: Whether this is the first article (saved as example)

        Returns:
            Final processed HTML content
        """
        # Fetch HTML from web
        article.html = self.fetch_article_html(article)

        # Save first article as example
        if is_first and self.feed:
            self.save_example(article.html)

        # Extract header image URL before content extraction
        # (needs full page HTML to find header images outside main content)
        header_image_url = self.get_header_image_url(article)

        # Extract article content
        self.extract_content(article)

        # Remove unwanted elements
        self.remove_unwanted_elements(article)

        # Sanitize HTML
        self.sanitize_content(article)

        # Standardize format (add header image, source link)
        self.standardize_format(article, header_image_url=header_image_url)

        # AI processing
        self.process_ai_features(article)

        return article.html

    # ============================================================================
    # STEP 4f: FALLBACK CONTENT
    # ============================================================================

    def fallback_content(self, article: RawArticle) -> str:
        """
        Generate fallback content when web fetching fails.

        Override this to customize fallback behavior.

        Args:
            article: The article to generate fallback for

        Returns:
            Fallback HTML content (usually from RSS)
        """
        article.html = article.content  # Use RSS content as fallback
        self.remove_unwanted_elements(article)
        self.sanitize_content(article)
        self.standardize_format(article)
        return article.html

    # ============================================================================
    # STEP 4g: AI PROCESSING
    # ============================================================================

    def process_ai_features(self, article: RawArticle) -> None:
        """
        Process AI features (translate, summarize, custom prompt) on article content.

        Order of operations:
        1. Translation (if configured)
        2. Summarization (if configured)
        3. Custom prompt (if configured)

        On error: keeps original content, sets article.ai_error
        """
        from django.conf import settings

        # Skip if AI not enabled globally
        if not settings.AI_ENABLED:
            return

        # Skip if no AI features configured for this feed
        if not self.feed:
            return

        has_translate = bool(self.feed.ai_translate_to)
        has_summarize = self.feed.ai_summarize
        has_custom_prompt = bool(self.feed.ai_custom_prompt)

        if not (has_translate or has_summarize or has_custom_prompt):
            return

        # Check user quota
        from core.services.ai_service import AIQuotaExceededError, AIService

        ai_service = AIService()

        try:
            # Check quota
            if self.feed.user:
                ai_service.check_quota(self.feed.user)

            original_content = article.html

            # Step 1: Translation
            if has_translate:
                try:
                    self.logger.info(f"Translating to {self.feed.ai_translate_to}")
                    article.html = ai_service.translate(
                        article.html, target_language=self.feed.ai_translate_to
                    )
                except Exception as e:
                    error_msg = f"Translation failed: {str(e)[:100]}"
                    self.logger.error(f"{error_msg} (full error: {e})", exc_info=True)
                    article.ai_error = error_msg
                    article.html = original_content
                    return  # Stop processing on error

            # Step 2: Summarization
            if has_summarize:
                try:
                    self.logger.info("Generating summary")
                    summary = ai_service.summarize(article.html)
                    # Replace content with summary
                    article.html = summary
                except Exception as e:
                    error_msg = f"Summarization failed: {str(e)[:100]}"
                    self.logger.error(f"{error_msg} (full error: {e})", exc_info=True)
                    article.ai_error = error_msg
                    article.html = original_content
                    return

            # Step 3: Custom Prompt
            if has_custom_prompt:
                try:
                    self.logger.info(
                        f"Applying custom prompt: {self.feed.ai_custom_prompt[:50]}..."
                    )
                    article.html = ai_service.custom_prompt(
                        article.html, prompt=self.feed.ai_custom_prompt
                    )
                except Exception as e:
                    error_msg = f"Custom prompt failed: {str(e)[:100]}"
                    self.logger.error(f"{error_msg} (full error: {e})", exc_info=True)
                    article.ai_error = error_msg
                    article.html = original_content
                    return

            # Mark as processed
            article.ai_processed = True

            # Increment quota
            if self.feed.user:
                ai_service.increment_quota(self.feed.user)

            self.logger.info("AI processing completed successfully")

        except AIQuotaExceededError as e:
            error_msg = "AI quota exceeded"
            self.logger.warning(f"{error_msg}: {e}")
            article.ai_error = error_msg

        except Exception as e:
            error_msg = f"AI processing failed: {str(e)[:100]}"
            self.logger.error(f"{error_msg} (full error: {e})", exc_info=True)
            article.ai_error = error_msg

    # ============================================================================
    # STEP 5: SAVE TO DATABASE
    # ============================================================================

    def save_article(self, article: RawArticle, content: str) -> bool:
        """
        Save article to database.

        Override this if you need custom save logic.

        If feed.use_current_timestamp is True (default), uses timezone.now()
        as the article date. Otherwise, uses the date from the RSS entry.

        Args:
            article: The article to save
            content: Processed HTML content

        Returns:
            True if article was created (new), False if updated (existing)
        """
        from core.models import Article

        # Use current timestamp if feed is configured for it (default: True)
        if self.feed and getattr(self.feed, "use_current_timestamp", True):
            article_date = timezone.now()
        else:
            article_date = article.date

        defaults = {
            "feed": self.feed,
            "name": article.title,
            "date": article_date,
            "content": content,
            "ai_processed": article.ai_processed,
            "ai_error": article.ai_error,
        }

        # Include thumbnail URL if extracted during processing
        if article.thumbnail_url:
            defaults["thumbnail_url"] = article.thumbnail_url

        _, created = Article.objects.update_or_create(
            url=article.url,
            defaults=defaults,
        )

        if created:
            self.logger.info(f"Created: {article.title}")

        return created

    # ============================================================================
    # HELPER METHODS
    # ============================================================================

    def save_example(self, html: str) -> None:
        """Save HTML as example in feed."""
        if self.feed:
            self.feed.example = html
            self.feed.save(update_fields=["example"])

    # ============================================================================
    # LIFECYCLE HOOKS - Override for custom behavior
    # ============================================================================

    def on_aggregation_start(self) -> None:  # noqa: B027
        """Called when aggregation starts. Override for custom initialization."""
        pass

    def on_aggregation_complete(self, new_articles_count: int) -> None:  # noqa: B027
        """Called when aggregation completes. Override for custom cleanup."""
        pass

    def on_article_created(self, article: RawArticle) -> None:  # noqa: B027
        """Called when a new article is created. Override for custom logic."""
        pass

    def on_article_error(self, entry: Any, error: Exception) -> None:  # noqa: B027
        """Called when article processing fails. Override for custom error handling."""
        pass

    # ============================================================================
    # DailyLimitMixin Implementation
    # ============================================================================

    def get_posts_added_today(self) -> int:
        """
        Count articles added today (since UTC midnight) for this feed.

        Returns:
            Number of articles added today
        """
        from core.models import Article

        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return Article.objects.filter(
            feed=self.feed, created_at__gte=today_start
        ).count()

    def _get_most_recent_post_time_today(self) -> datetime | None:
        """
        Get the creation time of the most recent article added today.

        Returns:
            Datetime of most recent article, or None
        """
        from core.models import Article

        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        recent_article = (
            Article.objects.filter(feed=self.feed, created_at__gte=today_start)
            .order_by("-created_at")
            .first()
        )
        return recent_article.created_at if recent_article else None
