"""
Core models for the Yana RSS feed aggregator.
"""

import logging

from django.conf import settings
from django.db import models
from django.utils import timezone

logger = logging.getLogger(__name__)


# Default aggregator ID
DEFAULT_AGGREGATOR_ID = "full_website"

# Feed type choices
FEED_TYPE_CHOICES = [
    ("article", "Article"),
    ("youtube", "YouTube"),
    ("podcast", "Podcast"),
    ("reddit", "Reddit"),
]


# Icon fetching functions removed - use core.services.icon_service.IconService instead


class Feed(models.Model):
    """
    Represents a feed source.

    Attributes:
        name: Human-readable name of the feed
        identifier: Feed identifier (URL for RSS, subreddit name for Reddit, channel for YouTube)
        feed_type: Type of feed (article, youtube, podcast, reddit)
        icon: URL or path to the feed's icon/logo
        example: Full HTML content from a sample article (for reference)
        aggregator: Aggregator ID (e.g., 'heise', 'default')
        enabled: Whether the feed is enabled (for managed feeds, controls if aggregation runs)
        generate_title_image: Extract and display a header image from article content
        add_source_footer: Add a source link at the bottom of each article
        skip_duplicates: Skip articles with duplicate titles from the last 7 days
        daily_post_limit: Daily post target (-1=unlimited, 0=disabled, n>0=~n posts/day distributed evenly)
        aggregator_options: Configuration options for the aggregator (JSON format)
        groups: Groups this feed belongs to
        user: The user who owns this feed (None = shared feed visible to all)
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="feeds",
        help_text="User who owns this feed (None = shared feed visible to all)",
    )
    name = models.CharField(max_length=255, help_text="Name of the feed")
    identifier = models.CharField(
        max_length=500,
        help_text="Feed identifier (URL for RSS feeds, subreddit name for Reddit, channel for YouTube, etc.)",
    )
    feed_type = models.CharField(
        max_length=20,
        choices=FEED_TYPE_CHOICES,
        default="article",
        help_text="Type of feed: article (default), youtube, or podcast",
    )
    icon = models.URLField(
        max_length=500, blank=True, null=True, help_text="Feed icon URL"
    )
    example = models.TextField(
        blank=True, help_text="Example article HTML for reference"
    )
    aggregator = models.CharField(
        max_length=255,
        default=DEFAULT_AGGREGATOR_ID,
        help_text="Aggregator ID (e.g., 'heise', 'default')",
    )
    enabled = models.BooleanField(
        default=True,
        help_text="Whether this feed is enabled for aggregation",
    )
    generate_title_image = models.BooleanField(
        default=True,
        help_text="Extract and display a header image from article content",
    )
    add_source_footer = models.BooleanField(
        default=True,
        help_text="Add a source link at the bottom of each article",
    )
    skip_duplicates = models.BooleanField(
        default=True,
        help_text="Skip articles with duplicate titles from the last 7 days",
    )
    use_current_timestamp = models.BooleanField(
        default=True,
        help_text="Use current time as article timestamp instead of RSS feed date",
    )
    daily_post_limit = models.IntegerField(
        default=50,
        help_text="Daily post target: -1=unlimited, 0=disabled, n>0=~n posts/day distributed evenly",
    )
    aggregator_options = models.JSONField(
        default=dict,
        blank=True,
        help_text="Configuration options for the aggregator (JSON format)",
    )
    groups = models.ManyToManyField(
        "api.Group",
        related_name="feeds",
        blank=True,
        help_text="Groups this feed belongs to",
    )
    # AI features
    ai_translate_to = models.CharField(
        max_length=10,
        blank=True,
        default="",
        help_text="Target language code (e.g., 'en', 'de', 'es'). Leave empty to disable translation.",
    )
    ai_summarize = models.BooleanField(
        default=False,
        help_text="Generate AI summary of article content",
    )
    ai_custom_prompt = models.TextField(
        blank=True,
        default="",
        max_length=500,
        help_text="Custom AI prompt to process article content. Leave empty to disable.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Feed"
        verbose_name_plural = "Feeds"

    def __str__(self) -> str:
        return self.name

    def __repr__(self) -> str:
        return f"<Feed: {self.name} ({self.identifier})>"

    def get_aggregator_options(self) -> dict:
        """
        Get aggregator options with defaults applied.

        Returns:
            Dictionary of aggregator options (may be empty)
        """
        return self.aggregator_options or {}

    def get_aggregator_class(self):
        """
        Get the aggregator class for this feed.

        DEPRECATED: Use FeedService.get_feed_aggregator_class() instead.
        Kept for backward compatibility during migration.

        Returns:
            Aggregator class

        Raises:
            ValueError: If aggregator not found or cannot be loaded
        """
        from core.services.feed_service import FeedService

        feed_service = FeedService()
        return feed_service.get_feed_aggregator_class(self)

    def get_aggregator_metadata(self):
        """
        Get metadata for this feed's aggregator.

        Returns:
            AggregatorMetadata or None if aggregator is broken
        """
        from aggregators import get_aggregator_by_id

        return get_aggregator_by_id(self.aggregator)

    def save(self, *args, **kwargs) -> None:
        """
        Save the feed, queueing favicon fetch as a background task if needed.

        Args:
            *args: Positional arguments passed to parent save()
            **kwargs: Keyword arguments passed to parent save()
        """
        # Check if we need to fetch icon
        needs_icon = not self.icon and self.identifier

        # Determine icon fetch method based on feed type
        icon_fetch_needed = False
        if needs_icon:
            if self.feed_type == "reddit" or self.feed_type == "youtube":
                icon_fetch_needed = True
            elif self.identifier and self.identifier.startswith(
                ("http://", "https://")
            ):
                # Regular RSS feed - fetch favicon from URL
                icon_fetch_needed = True

        super().save(*args, **kwargs)

        # Queue icon fetch as background task after save
        if icon_fetch_needed:
            logger.info(
                f"Queueing icon fetch for feed '{self.name}' (type: {self.feed_type})"
            )
            try:
                from django_q.tasks import async_task

                async_task(
                    "core.tasks.fetch_feed_favicon",
                    self.pk,
                    task_name=f"fetch_favicon_{self.pk}",
                )
            except ImportError:
                # Django-Q not available, fetch synchronously as fallback
                logger.debug("Django-Q not available, fetching icon synchronously")
                from core.services.icon_service import IconService

                icon_service = IconService()
                icon_url = icon_service.fetch_feed_icon(self)
                if icon_url:
                    # Use update to avoid recursion
                    Feed.objects.filter(pk=self.pk).update(icon=icon_url)
                    logger.info(f"Set icon for feed '{self.name}': {icon_url}")
            except Exception as e:
                logger.warning(f"Could not queue icon fetch for '{self.name}': {e}")


class Article(models.Model):
    """
    Represents an article from an RSS feed.

    Attributes:
        feed: The feed this article belongs to
        name: Article title
        url: URL of the original article
        date: Publication date (defaults to now)
        content: Sanitized HTML content of the article
        thumbnail_url: Thumbnail/preview image URL (for videos and podcasts)
        media_url: Direct URL to media file (video embed URL or podcast audio file)
        duration: Duration in seconds (for videos and podcasts)
        view_count: View count (for YouTube videos)
        media_type: MIME type of media (e.g., 'audio/mpeg', 'video/mp4')
    """

    feed = models.ForeignKey(
        Feed,
        on_delete=models.CASCADE,
        related_name="articles",
        help_text="The feed this article belongs to",
    )
    name = models.CharField(max_length=500, help_text="Article title")
    url = models.URLField(max_length=1000, unique=True, help_text="Article URL")
    date = models.DateTimeField(default=timezone.now, help_text="Publication date")
    content = models.TextField(help_text="Article HTML content")
    # Media metadata fields (for YouTube videos and podcasts)
    thumbnail_url = models.URLField(
        max_length=1000,
        blank=True,
        help_text="Thumbnail/preview image URL",
    )
    media_url = models.URLField(
        max_length=1000,
        blank=True,
        help_text="Direct URL to media (video embed URL or audio file)",
    )
    duration = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Duration in seconds",
    )
    view_count = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="View count (for YouTube videos)",
    )
    media_type = models.CharField(
        max_length=100,
        blank=True,
        help_text="MIME type of media (e.g., 'audio/mpeg')",
    )
    # Optional fields for social media content (Reddit, etc.)
    author = models.CharField(
        max_length=255,
        blank=True,
        help_text="Author/creator name (for Reddit posts, podcasts, etc.)",
    )
    external_id = models.CharField(
        max_length=100,
        blank=True,
        db_index=True,
        help_text="External platform ID (e.g., Reddit post ID, YouTube video ID)",
    )
    score = models.IntegerField(
        null=True,
        blank=True,
        help_text="Score/rating (e.g., Reddit upvotes)",
    )
    # AI processing metadata
    ai_processed = models.BooleanField(
        default=False,
        help_text="Whether AI processing was applied to this article",
    )
    ai_error = models.CharField(
        max_length=500,
        blank=True,
        default="",
        help_text="Short error message if AI processing failed",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date"]
        verbose_name = "Article"
        verbose_name_plural = "Articles"
        indexes = [
            models.Index(fields=["-date"]),
            models.Index(fields=["feed", "-date"]),
            # Performance indexes for duplicate checking and navigation
            models.Index(fields=["feed", "name", "created_at"]),
            models.Index(fields=["feed", "created_at"]),
            models.Index(fields=["feed", "date", "id"]),
        ]

    def __str__(self) -> str:
        return self.name

    def __repr__(self) -> str:
        return f"<Article: {self.name} from {self.feed.name}>"

    @property
    def is_video(self) -> bool:
        """Check if this article is a video (YouTube)."""
        return self.feed.feed_type == "youtube"

    @property
    def is_podcast(self) -> bool:
        """Check if this article is a podcast episode."""
        return self.feed.feed_type == "podcast"

    @property
    def is_reddit(self) -> bool:
        """Check if this article is a Reddit post."""
        return self.feed.feed_type == "reddit"

    @property
    def has_media(self) -> bool:
        """Check if this article has embedded media."""
        return bool(self.media_url)

    @property
    def duration_formatted(self) -> str:
        """Format duration as HH:MM:SS or MM:SS."""
        if not self.duration:
            return ""
        hours, remainder = divmod(self.duration, 3600)
        minutes, seconds = divmod(remainder, 60)
        if hours:
            return f"{hours}:{minutes:02d}:{seconds:02d}"
        return f"{minutes}:{seconds:02d}"

    @property
    def youtube_video_id(self) -> str | None:
        """Extract YouTube video ID from URL."""
        if not self.is_video:
            return None
        # YouTube URLs: https://www.youtube.com/watch?v=VIDEO_ID
        import re

        match = re.search(r"(?:v=|youtu\.be/)([a-zA-Z0-9_-]{11})", self.url)
        return match.group(1) if match else None

    @property
    def youtube_embed_url(self) -> str | None:
        """Get YouTube proxy URL for iframe."""
        from api.youtube import get_youtube_proxy_url

        video_id = self.youtube_video_id
        if video_id:
            return get_youtube_proxy_url(video_id)
        return None


class UserAIQuota(models.Model):
    """
    Track AI token usage per user with daily and monthly limits.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ai_quota",
        help_text="User this quota applies to",
    )

    # Limits (configurable per user)
    daily_limit = models.IntegerField(
        default=200,  # From settings.AI_DEFAULT_DAILY_LIMIT
        help_text="Maximum AI requests per day",
    )
    monthly_limit = models.IntegerField(
        default=2000,  # From settings.AI_DEFAULT_MONTHLY_LIMIT
        help_text="Maximum AI requests per month",
    )

    # Usage tracking
    daily_used = models.IntegerField(
        default=0,
        help_text="AI requests used today",
    )
    monthly_used = models.IntegerField(
        default=0,
        help_text="AI requests used this month",
    )

    # Reset timestamps
    daily_reset_at = models.DateTimeField(
        help_text="When daily quota resets (UTC midnight)",
    )
    monthly_reset_at = models.DateTimeField(
        help_text="When monthly quota resets (first of month)",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "User AI Quota"
        verbose_name_plural = "User AI Quotas"

    def __str__(self) -> str:
        return f"{self.user.username}: {self.daily_used}/{self.daily_limit} daily, {self.monthly_used}/{self.monthly_limit} monthly"

    def can_use_ai(self) -> bool:
        """Check if user has quota remaining."""
        self.reset_if_needed()
        return (
            self.daily_used < self.daily_limit
            and self.monthly_used < self.monthly_limit
        )

    def increment_usage(self) -> None:
        """Increment usage counters."""
        self.reset_if_needed()
        self.daily_used += 1
        self.monthly_used += 1
        self.save()

    def reset_if_needed(self) -> None:
        """Reset counters if time period has passed."""
        from datetime import timedelta

        now = timezone.now()

        # Reset daily counter
        if now >= self.daily_reset_at:
            self.daily_used = 0
            # Set next reset to tomorrow at midnight UTC
            self.daily_reset_at = (now + timedelta(days=1)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )

        # Reset monthly counter
        if now >= self.monthly_reset_at:
            self.monthly_used = 0
            # Set next reset to first of next month
            if now.month == 12:
                next_month = now.replace(year=now.year + 1, month=1, day=1)
            else:
                next_month = now.replace(month=now.month + 1, day=1)
            self.monthly_reset_at = next_month.replace(
                hour=0, minute=0, second=0, microsecond=0
            )

        self.save()
