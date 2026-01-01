"""Google Reader API stream filtering.

Builds Django ORM Q objects based on Google Reader stream ID formats.
Supports various stream types: feeds, labels, starred, read state, etc.
"""

import logging
from abc import ABC, abstractmethod
from typing import Optional, Tuple

from django.db.models import Q

from core.models import Feed

logger = logging.getLogger(__name__)


class StreamFilter(ABC):
    """Base class for stream filters."""

    @abstractmethod
    def can_handle(self, stream_id: str) -> bool:
        """Check if this filter can handle the given stream ID.

        Args:
            stream_id: Stream ID string

        Returns:
            True if this filter can handle it
        """
        pass

    @abstractmethod
    def build_conditions(self, stream_id: str, user_id: int) -> Tuple[Optional[Q], bool]:
        """Build Q conditions for this stream.

        Args:
            stream_id: Stream ID string
            user_id: Django user ID

        Returns:
            Tuple of (Q conditions or None, needs_extra_join flag)
        """
        pass


class FeedFilter(StreamFilter):
    """Filter for specific feed: feed/{feed_id}"""

    def can_handle(self, stream_id: str) -> bool:
        return stream_id.startswith("feed/")

    def build_conditions(self, stream_id: str, user_id: int) -> Tuple[Optional[Q], bool]:
        try:
            feed_id = int(stream_id.replace("feed/", ""))
            return Q(feed_id=feed_id), False
        except ValueError:
            logger.warning(f"Invalid feed ID in stream: {stream_id}")
            return None, False


class LabelFilter(StreamFilter):
    """Filter for custom labels (groups): user/-/label/{label_name}"""

    def can_handle(self, stream_id: str) -> bool:
        return stream_id.startswith("user/-/label/")

    def build_conditions(self, stream_id: str, user_id: int) -> Tuple[Optional[Q], bool]:
        label_name = stream_id.replace("user/-/label/", "")

        # Handle special labels for aggregator types
        if label_name == "Reddit":
            return Q(feed__user_id__in=[user_id, None], feed__aggregator="reddit"), True

        if label_name == "YouTube":
            return Q(feed__user_id__in=[user_id, None], feed__aggregator="youtube"), True

        if label_name == "Podcasts":
            return Q(feed__user_id__in=[user_id, None], feed__aggregator="podcast"), True

        # Handle custom user labels (groups)
        # Get feed IDs that belong to this group
        from core.models import FeedGroup

        try:
            group = FeedGroup.objects.get(name=label_name, user_id=user_id)
            feed_ids = Feed.objects.filter(group=group, enabled=True).values_list("id", flat=True)

            if feed_ids:
                return Q(feed_id__in=feed_ids), False
            else:
                return Q(feed_id=-1), False  # No feeds in this group

        except FeedGroup.DoesNotExist:
            logger.warning(f"Label not found: {label_name} for user {user_id}")
            return Q(feed_id=-1), False  # No match


class StarredFilter(StreamFilter):
    """Filter for starred articles: user/-/state/com.google/starred"""

    def can_handle(self, stream_id: str) -> bool:
        return stream_id == "user/-/state/com.google/starred"

    def build_conditions(self, stream_id: str, user_id: int) -> Tuple[Optional[Q], bool]:
        return Q(starred=True), False


class ReadFilter(StreamFilter):
    """Filter for read articles: user/-/state/com.google/read"""

    def can_handle(self, stream_id: str) -> bool:
        return stream_id == "user/-/state/com.google/read"

    def build_conditions(self, stream_id: str, user_id: int) -> Tuple[Optional[Q], bool]:
        return Q(read=True), False


class UnreadFilter(StreamFilter):
    """Filter for unread articles (implied by default stream)."""

    def can_handle(self, stream_id: str) -> bool:
        return False  # This is for unread only, not a primary filter

    def build_conditions(self, stream_id: str, user_id: int) -> Tuple[Optional[Q], bool]:
        return Q(read=False), False


class DefaultFilter(StreamFilter):
    """Default filter for all articles: user/-/state/com.google/reading-list or empty"""

    def can_handle(self, stream_id: str) -> bool:
        return (
            stream_id == "user/-/state/com.google/reading-list"
            or stream_id == ""
            or stream_id is None
        )

    def build_conditions(self, stream_id: str, user_id: int) -> Tuple[Optional[Q], bool]:
        # All articles from accessible feeds (user's + shared)
        return Q(feed__user_id__in=[user_id, None]), True


class StreamFilterOrchestrator:
    """Orchestrates stream filtering using strategy pattern.

    Determines which filter to use based on stream ID and builds appropriate Q conditions.
    """

    def __init__(self):
        """Initialize with all available filters."""
        self.filters = [
            FeedFilter(),
            LabelFilter(),
            StarredFilter(),
            ReadFilter(),
            DefaultFilter(),
        ]

    def build_filter(self, stream_id: str, user_id: int) -> Tuple[Optional[Q], bool]:
        """Build Q conditions for the given stream ID.

        Args:
            stream_id: Stream ID string
            user_id: Django user ID

        Returns:
            Tuple of (Q conditions or None, needs_access_control flag)
        """
        stream_id = stream_id.strip() if stream_id else ""

        for filter_class in self.filters:
            if filter_class.can_handle(stream_id):
                conditions, needs_access = filter_class.build_conditions(stream_id, user_id)
                logger.debug(
                    f"Stream filter '{filter_class.__class__.__name__}' used for: {stream_id}"
                )

                # Always add feed access control unless filter explicitly handles it
                if needs_access and conditions or not needs_access:
                    conditions &= Q(feed__enabled=True)

                return conditions, needs_access

        # Fallback: return None (should not happen with DefaultFilter as last option)
        logger.warning(f"No filter matched for stream ID: {stream_id}")
        return None, False

    def build_filters_for_ids(
        self,
        stream_id: str,
        user_id: int,
        exclude_read: bool = False,
        include_tag: str = None,
    ) -> Tuple[Optional[Q], bool]:
        """Build conditions with additional filters (read status, tags).

        Args:
            stream_id: Stream ID
            user_id: User ID
            exclude_read: If True, exclude read articles
            include_tag: If set, only include articles with this tag

        Returns:
            Tuple of (Q conditions, needs_access_control)
        """
        conditions, needs_access = self.build_filter(stream_id, user_id)

        if not conditions:
            return None, needs_access

        # Apply read filter
        if exclude_read:
            conditions &= Q(read=False)

        # Apply tag filter
        if include_tag:
            if include_tag == "user/-/state/com.google/starred":
                conditions &= Q(starred=True)
            elif include_tag == "user/-/state/com.google/read":
                conditions &= Q(read=True)

        return conditions, needs_access
