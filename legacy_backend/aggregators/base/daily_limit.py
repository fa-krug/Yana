"""
Daily post limit mixin for aggregators.

This module provides intelligent daily post limiting that distributes posts
evenly throughout the day across multiple aggregation runs.
"""

import logging
from datetime import timedelta
from math import ceil
from typing import TYPE_CHECKING

from django.utils import timezone

if TYPE_CHECKING:
    from datetime import datetime

logger = logging.getLogger(__name__)


class DailyLimitMixin:
    """
    Mixin providing daily post limit functionality for aggregators.

    This mixin adds intelligent daily post limiting that distributes posts evenly
    throughout the day. Instead of fetching all posts at once, it calculates how
    many posts to fetch per run based on:
    - Total daily limit
    - Posts already fetched today
    - Estimated remaining runs until midnight

    Usage:
        class MyAggregator(BaseAggregator, DailyLimitMixin):
            # Override get_posts_added_today and get_model_class
            pass

    Attributes from feed/source object (must have these fields):
        daily_post_limit: int
            - -1: Unlimited (safety max: 100 posts per run)
            - 0: Disabled (no posts fetched)
            - n > 0: Target ~n posts per day, distributed evenly
    """

    def get_dynamic_fetch_limit(self, force_refresh: bool = False) -> int:
        """
        Calculate how many posts to fetch this run based on daily limit and distribution.

        Args:
            force_refresh: If True, fetch up to full daily limit regardless of today's count

        Returns:
            Number of posts to fetch (0 if quota exhausted or disabled)
        """
        # Get daily limit from feed or source object
        limit = self._get_daily_post_limit()

        # Unlimited
        if limit == -1:
            return 100  # Safety maximum per run

        # Disabled
        if limit == 0:
            return 0

        # Force refresh: fetch up to full daily limit
        if force_refresh:
            return limit

        # Calculate distribution
        posts_today = self.get_posts_added_today()
        remaining_quota = limit - posts_today

        if remaining_quota <= 0:
            source_name = self._get_source_name()
            logger.info(
                f"Daily quota exhausted for {source_name}: {posts_today}/{limit}"
            )
            return 0  # Quota exhausted

        remaining_runs = self.calculate_remaining_runs_today()
        dynamic_limit = max(1, ceil(remaining_quota / remaining_runs))

        source_name = self._get_source_name()
        logger.info(
            f"Dynamic limit for {source_name}: {dynamic_limit} posts "
            f"({posts_today}/{limit} today, ~{remaining_runs} runs left)"
        )

        return dynamic_limit

    def get_posts_added_today(self) -> int:
        """
        Count posts added today (since UTC midnight) for this feed/source.

        This method MUST be overridden by the aggregator to query the appropriate model.

        Returns:
            Number of posts added today

        Example:
            def get_posts_added_today(self) -> int:
                now = timezone.now()
                today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
                return Article.objects.filter(
                    feed=self.feed,
                    created_at__gte=today_start
                ).count()
        """
        raise NotImplementedError(
            f"{self.__class__.__name__} must implement get_posts_added_today()"
        )

    def calculate_remaining_runs_today(self) -> int:
        """
        Estimate remaining aggregation runs until UTC midnight based on time since last run.

        This function calculates how many more times aggregation will run today by:
        1. Looking at the most recent post added today
        2. Calculating time since that post was added (= time since last run)
        3. Estimating remaining runs: seconds_until_midnight / seconds_since_last_run

        Returns:
            Estimated number of remaining runs (at least 1 to avoid division by zero)
        """
        now = timezone.now()
        midnight = (now + timedelta(days=1)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        seconds_until_midnight = (midnight - now).total_seconds()

        # Get most recent post added today
        recent_post_time = self._get_most_recent_post_time_today()

        if recent_post_time:
            # Calculate time since last post was added
            seconds_since_last_run = (now - recent_post_time).total_seconds()
        else:
            # No posts today yet, estimate based on time since midnight
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            seconds_since_midnight = (now - today_start).total_seconds()
            if seconds_since_midnight > 0:
                seconds_since_last_run = seconds_since_midnight
            else:
                # Edge case: very start of day
                seconds_since_last_run = 1800  # Assume 30 min default

        # Avoid division by zero
        if seconds_since_last_run <= 0:
            seconds_since_last_run = 1800  # Default to 30 minutes

        # Estimate remaining runs
        estimated_runs = seconds_until_midnight / seconds_since_last_run
        return max(1, int(ceil(estimated_runs)))

    # ============================================================================
    # Helper methods (can be overridden for custom behavior)
    # ============================================================================

    def _get_daily_post_limit(self) -> int:
        """
        Get the daily post limit from the feed/source object.

        Override this if your feed/source object uses a different field name.

        Returns:
            Daily post limit (-1=unlimited, 0=disabled, n>0=target)
        """
        # Try to get from feed first, then from a source attribute
        if (
            hasattr(self, "feed")
            and self.feed
            and hasattr(self.feed, "daily_post_limit")
        ):
            return self.feed.daily_post_limit

        # Try to get from source object (for social media)
        if (
            hasattr(self, "source")
            and self.source
            and hasattr(self.source, "daily_post_limit")
        ):
            return self.source.daily_post_limit

        # Default to 50
        return 50

    def _get_source_name(self) -> str:
        """
        Get a human-readable name for the feed/source for logging.

        Override this if your feed/source object uses a different field name.

        Returns:
            Source name for logging
        """
        if hasattr(self, "feed") and self.feed:
            return getattr(self.feed, "name", "Unknown Feed")

        if hasattr(self, "source") and self.source:
            return getattr(self.source, "name", "Unknown Source")

        return "Unknown"

    def _get_most_recent_post_time_today(self) -> "datetime | None":
        """
        Get the creation time of the most recent post added today.

        This method should be overridden to query the appropriate model.
        Returns None if no posts were added today.

        Returns:
            Datetime of most recent post, or None

        Example:
            def _get_most_recent_post_time_today(self) -> datetime | None:
                now = timezone.now()
                today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
                recent_post = (
                    Article.objects.filter(feed=self.feed, created_at__gte=today_start)
                    .order_by("-created_at")
                    .first()
                )
                return recent_post.created_at if recent_post else None
        """
        # Default implementation returns None (will use time since midnight)
        return None
