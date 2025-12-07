"""
Stream service for Google Reader API.

Handles stream operations including contents, item IDs, and unread counts.
"""

import contextlib
import logging
import time
from datetime import datetime
from urllib.parse import urlparse

from django.db.models import Count, Exists, Max, OuterRef, Q
from django.utils import timezone

from core.models import Article, Feed
from core.services.base import BaseService

from ..models import Group, UserArticleState

logger = logging.getLogger(__name__)

# Standard Google Reader state tags
STATE_READ = "user/-/state/com.google/read"
STATE_STARRED = "user/-/state/com.google/starred"
STATE_READING_LIST = "user/-/state/com.google/reading-list"
STATE_KEPT_UNREAD = "user/-/state/com.google/kept-unread"


class StreamService(BaseService):
    """
    Service for handling streams in Google Reader API.

    Handles:
    - Stream contents
    - Stream item IDs
    - Unread counts
    - Article filtering
    """

    def get_stream_contents(
        self,
        user,
        stream_id: str = "",
        item_ids: list[str] = None,
        exclude_tag: str = "",
        limit: int = 50,
        older_than: str = "",
        continuation: str = "",
    ) -> dict:
        """
        Fetch feed items from specified stream.

        Args:
            user: The user
            stream_id: Stream ID (e.g., "feed/123", "user/-/state/com.google/starred")
            item_ids: List of specific item IDs to fetch (optional)
            exclude_tag: Tag to exclude (e.g., STATE_READ)
            limit: Maximum number of items to return
            older_than: Timestamp to filter articles older than
            continuation: Continuation token for pagination

        Returns:
            Dictionary with stream contents in Google Reader API format
        """
        # Handle pagination
        offset = 0
        if continuation:
            with contextlib.suppress(ValueError):
                offset = int(continuation)

        # Filter: only articles from user's enabled feeds + shared enabled feeds (user=NULL)
        articles = Article.objects.select_related("feed").filter(
            Q(feed__user=user) | Q(feed__user__isnull=True), feed__enabled=True
        )

        # Filter by specific item IDs
        if item_ids:
            article_ids = [self._parse_item_id(i) for i in item_ids]
            articles = articles.filter(id__in=article_ids)
        else:
            # Filter by stream
            articles = self._filter_articles_by_stream(articles, stream_id, user)

        # Exclude read articles using Exists subquery
        if exclude_tag == STATE_READ:
            read_subquery = UserArticleState.objects.filter(
                user=user, article_id=OuterRef("pk"), is_read=True
            )
            articles = articles.exclude(Exists(read_subquery))

        articles = self._apply_timestamp_filter(articles, older_than)

        # Fetch paginated articles
        fetch_limit = offset + limit
        article_list = list(articles.order_by("-date")[:fetch_limit])
        article_ids_list = [a.id for a in article_list]

        # Get user states for articles
        article_states = {
            s.article_id: s
            for s in UserArticleState.objects.filter(
                user=user, article_id__in=article_ids_list
            )
        }

        # Build items
        all_items = []
        for article in article_list:
            state = article_states.get(article.id)
            categories = [STATE_READING_LIST]
            if state and state.is_read:
                categories.append(STATE_READ)
            if state and state.is_saved:
                categories.append(STATE_STARRED)

            timestamp_sec = int(article.date.timestamp())
            updated_sec = int(article.updated_at.timestamp())
            all_items.append(
                {
                    "id": f"tag:google.com,2005:reader/item/{self._to_hex_id(article.id)}",
                    "title": article.name,
                    "published": timestamp_sec,
                    "updated": updated_sec,
                    "crawlTimeMsec": str(int(article.date.timestamp() * 1000)),
                    "timestampUsec": str(int(article.date.timestamp() * 1000000)),
                    "alternate": [{"href": article.url}],
                    "canonical": [{"href": article.url}],
                    "categories": categories,
                    "origin": {
                        "streamId": f"feed/{article.feed_id}",
                        "title": article.feed.name,
                        "htmlUrl": self._get_site_url(article.feed),
                    },
                    "summary": {"content": article.content},
                    "_sort_date": article.date,
                }
            )

        # Apply pagination
        paginated_items = all_items[offset : offset + limit]

        # Build final items (remove internal fields)
        items = []
        for item in paginated_items:
            del item["_sort_date"]
            items.append(item)

        response = {
            "id": stream_id or STATE_READING_LIST,
            "updated": int(time.time()),
            "items": items,
        }

        # Add continuation token if there might be more
        if len(paginated_items) == limit:
            response["continuation"] = str(offset + limit)

        return response

    def get_stream_item_ids(
        self,
        user,
        stream_id: str = STATE_READING_LIST,
        limit: int = 1000,
        older_than: str = "",
        exclude_tag: str = "",
        include_tag: str = "",
        reverse_order: bool = False,
    ) -> dict:
        """
        Return item IDs for a stream.

        Args:
            user: The user
            stream_id: Stream ID
            limit: Maximum number of IDs to return (max 10000)
            older_than: Timestamp to filter articles older than
            exclude_tag: Tag to exclude
            include_tag: Tag to include
            reverse_order: Whether to reverse the order

        Returns:
            Dictionary with item IDs in Google Reader API format
        """
        limit = min(limit, 10000)

        # Filter: only articles from user's enabled feeds + shared enabled feeds (user=NULL)
        articles = Article.objects.filter(
            Q(feed__user=user) | Q(feed__user__isnull=True), feed__enabled=True
        )
        articles = self._filter_articles_by_stream(articles, stream_id, user)

        # Use Exists subquery for better performance
        if exclude_tag == STATE_READ:
            read_subquery = UserArticleState.objects.filter(
                user=user, article_id=OuterRef("pk"), is_read=True
            )
            articles = articles.exclude(Exists(read_subquery))

        if include_tag == STATE_STARRED:
            starred_subquery = UserArticleState.objects.filter(
                user=user, article_id=OuterRef("pk"), is_saved=True
            )
            articles = articles.filter(Exists(starred_subquery))

        articles = self._apply_timestamp_filter(articles, older_than)

        # Sort at database level and fetch only what we need
        order = "date" if reverse_order else "-date"
        item_refs = [
            {"id": str(aid)}
            for aid, _ in articles.order_by(order).values_list("id", "date")[:limit]
        ]

        return {"itemRefs": item_refs}

    def get_unread_count(self, user, include_all: bool = False) -> dict:
        """
        Return unread counts per feed.

        Args:
            user: The user
            include_all: Include feeds with 0 unread

        Returns:
            Dictionary with unread counts in Google Reader API format
        """
        # Try to get from cache (30 second TTL for unread counts)
        cache_key = f"unread_counts_{user.pk}_{include_all}"
        cached_result = self._cache_get(cache_key)
        if cached_result is not None:
            return cached_result

        unread_counts = []
        total_unread = 0

        # Get all read article IDs for this user
        read_article_ids = set(
            UserArticleState.objects.filter(user=user, is_read=True).values_list(
                "article_id", flat=True
            )
        )

        # Get enabled feeds with article counts
        feeds = Feed.objects.filter(
            Q(user=user) | Q(user__isnull=True), enabled=True
        ).annotate(
            total_articles=Count("articles"),
            newest_date=Max("articles__date"),
        )

        for feed in feeds:
            # Count read articles for this feed
            read_count = Article.objects.filter(
                feed=feed, id__in=read_article_ids
            ).count()
            unread_count = feed.total_articles - read_count

            if unread_count > 0 or include_all:
                timestamp_usec = "0"
                if feed.newest_date:
                    timestamp_usec = str(int(feed.newest_date.timestamp() * 1000000))

                unread_counts.append(
                    {
                        "id": f"feed/{feed.id}",
                        "count": unread_count,
                        "newestItemTimestampUsec": timestamp_usec,
                    }
                )
                total_unread += unread_count

        result = {"max": total_unread, "unreadcounts": unread_counts}

        # Cache for 30 seconds
        self._cache_set(cache_key, result, 30)

        return result

    def _filter_articles_by_stream(self, queryset, stream_id: str, user):
        """Filter articles by stream ID."""
        if not stream_id or stream_id == STATE_READING_LIST:
            return queryset
        elif stream_id == STATE_STARRED:
            starred_ids = UserArticleState.objects.filter(
                user=user, is_saved=True
            ).values_list("article_id", flat=True)
            return queryset.filter(id__in=starred_ids)
        elif stream_id.startswith("feed/"):
            try:
                feed_id = int(stream_id[5:])
                return queryset.filter(feed_id=feed_id)
            except ValueError:
                return queryset.none()
        elif stream_id.startswith("user/-/label/"):
            label_name = stream_id[13:]
            if label_name == "Reddit":
                return queryset.filter(feed__feed_type="reddit")
            elif label_name == "YouTube":
                return queryset.filter(feed__feed_type="youtube")
            elif label_name == "Podcasts":
                return queryset.filter(feed__feed_type="podcast")
            try:
                group = Group.objects.get(name=label_name)
                feed_ids = group.feeds.values_list("id", flat=True)
                return queryset.filter(feed_id__in=feed_ids)
            except Group.DoesNotExist:
                return queryset.none()
        return queryset

    def _apply_timestamp_filter(self, queryset, older_than: str):
        """Apply timestamp filter to queryset."""
        if older_than:
            try:
                older_dt = datetime.fromtimestamp(
                    int(older_than), tz=timezone.get_current_timezone()
                )
                return queryset.filter(date__lt=older_dt)
            except (ValueError, TypeError):
                pass
        return queryset

    def _parse_item_id(self, item_id: str) -> int:
        """Parse item ID from various formats to integer."""
        if item_id.startswith("tag:google.com,2005:reader/item/"):
            hex_id = item_id[32:]
            return int(hex_id, 16)
        elif len(item_id) == 16:
            try:
                return int(item_id, 16)
            except ValueError:
                pass
        try:
            return int(item_id)
        except ValueError:
            return 0

    def _to_hex_id(self, article_id: int) -> str:
        """Convert article ID to 16-character hex string."""
        return format(article_id, "016x")

    def _get_site_url(self, feed: Feed) -> str:
        """Get the site URL for a feed."""
        if feed.feed_type == "reddit":
            from aggregators.reddit import normalize_subreddit

            subreddit_name = normalize_subreddit(feed.identifier)
            return f"https://www.reddit.com/r/{subreddit_name}"

        if feed.feed_type == "youtube":
            identifier = feed.identifier
            if identifier.startswith("UC") and len(identifier) >= 24:
                return f"https://www.youtube.com/channel/{identifier}"
            elif identifier.startswith("@"):
                return f"https://www.youtube.com/{identifier}"
            else:
                try:
                    from aggregators.youtube import resolve_channel_id

                    channel_id, error = resolve_channel_id(identifier)
                    if channel_id and not error:
                        return f"https://www.youtube.com/channel/{channel_id}"
                    if identifier.startswith("@"):
                        return f"https://www.youtube.com/{identifier}"
                    return "https://www.youtube.com"
                except Exception:
                    return "https://www.youtube.com"

        if feed.identifier.startswith(("http://", "https://")):
            parsed = urlparse(feed.identifier)
            return f"{parsed.scheme}://{parsed.netloc}"

        return feed.identifier
