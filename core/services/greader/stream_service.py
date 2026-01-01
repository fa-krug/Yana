"""Google Reader API stream service.

Handles stream queries: article lists, unread counts, pagination, etc.
"""

import logging
from typing import Any

from django.core.cache import cache
from django.db.models import Q
from django.utils import timezone

from core.models import Article, Feed

logger = logging.getLogger(__name__)

# Cache timeout for unread counts (seconds)
UNREAD_COUNT_CACHE_TTL = 30


class StreamError(Exception):
    """Stream operation failed."""

    pass


def get_unread_count(user_id: int, include_all: bool = False) -> dict[str, Any]:
    """Get unread article counts per feed.

    Uses caching for performance (30-second TTL).

    Args:
        user_id: Django user ID
        include_all: If True, include feeds with 0 unread

    Returns:
        Dict with 'max' and 'unreadcounts' array
    """
    # Check cache
    cache_key = f"greader:unread:{user_id}:{include_all}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    # Compute unread counts
    result = _compute_unread_count(user_id, include_all)

    # Cache the result
    cache.set(cache_key, result, timeout=UNREAD_COUNT_CACHE_TTL)

    return result


def _compute_unread_count(user_id: int, include_all: bool) -> dict[str, Any]:
    """Actually compute unread counts (internal function)."""
    from core.services.greader.stream_format import unix_timestamp_microseconds

    unreadcounts = []

    # Get all accessible feeds
    feeds = Feed.objects.filter(
        Q(user_id=user_id) | Q(user_id__isnull=True),
        enabled=True,
    )

    for feed in feeds:
        # Get article count for this feed
        total_articles = feed.articles.count()
        read_articles = feed.articles.filter(read=True).count()
        unread_count = total_articles - read_articles

        # Skip if 0 unread and not include_all
        if unread_count == 0 and not include_all:
            continue

        # Get newest article timestamp
        newest_article = feed.articles.order_by("-date").first()
        newest_timestamp = unix_timestamp_microseconds(
            newest_article.date if newest_article else timezone.now()
        )

        unreadcounts.append(
            {
                "id": f"feed/{feed.id}",
                "count": unread_count,
                "newestItemTimestampUsec": newest_timestamp,
            }
        )

    return {
        "max": 150,
        "unreadcounts": unreadcounts,
    }


def get_stream_item_ids(
    user_id: int,
    stream_id: str = "",
    limit: int = 20,
    older_than: int | None = None,
    exclude_tag: str | None = None,
    include_tag: str | None = None,
    reverse_order: bool = False,
) -> dict[str, Any]:
    """Get article IDs from a stream (lightweight query for syncing).

    Args:
        user_id: Django user ID
        stream_id: Stream ID (feed/123, user/-/label/Name, etc.)
        limit: Maximum articles to return (max 10000)
        older_than: Optional timestamp - get articles older than this
        exclude_tag: Tag to exclude (typically read articles)
        include_tag: Tag to include (typically starred articles)
        reverse_order: If True, get newest first; else oldest first

    Returns:
        Dict with 'itemRefs' array containing article IDs
    """
    from core.services.greader.stream_filter_builder import StreamFilterOrchestrator

    # Limit maximum
    limit = min(limit, 10000)

    # Build query
    orchestrator = StreamFilterOrchestrator()
    conditions, _ = orchestrator.build_filters_for_ids(
        stream_id,
        user_id,
        exclude_read=(exclude_tag == "user/-/state/com.google/read"),
        include_tag=include_tag,
    )

    if not conditions:
        return {"itemRefs": []}

    # Get articles
    articles = Article.objects.filter(conditions)

    # Filter by timestamp if provided
    if older_than:
        from datetime import datetime, timezone

        from_datetime = datetime.fromtimestamp(older_than, tz=timezone.utc)
        articles = articles.filter(date__lte=from_datetime)

    # Order and limit
    articles = articles.order_by("date") if reverse_order else articles.order_by("-date")

    articles = articles[:limit]

    # Return IDs only
    item_ids = [str(article.id) for article in articles]

    return {
        "itemRefs": [{"id": item_id} for item_id in item_ids],
    }


def get_stream_contents(
    user_id: int,
    request,
    stream_id: str = "",
    item_ids: list[str] | None = None,
    limit: int = 50,
    older_than: int | None = None,
    exclude_tag: str | None = None,
    include_tag: str | None = None,
    continuation: str | None = None,
) -> dict[str, Any]:
    """Get full article contents from a stream (with pagination).

    Args:
        user_id: Django user ID
        request: Django request object
        stream_id: Stream ID (can be empty for default)
        item_ids: Specific item IDs to fetch (if provided, ignores stream_id)
        limit: Articles per page (default 50)
        older_than: Optional timestamp filter
        exclude_tag: Tag to exclude
        include_tag: Tag to include
        continuation: Continuation token for pagination

    Returns:
        Dict with 'items' array and optional 'continuation' token
    """
    from core.services.greader.stream_filter_builder import StreamFilterOrchestrator
    from core.services.greader.stream_format import format_stream_contents, format_stream_item

    # Handle specific item IDs
    if item_ids:
        from core.services.greader.stream_format import parse_item_id

        article_ids = []
        for item_id in item_ids:
            try:
                article_id = parse_item_id(item_id)
                article_ids.append(article_id)
            except ValueError:
                logger.warning(f"Invalid item ID: {item_id}")
                continue

        # Get articles
        articles = (
            Article.objects.filter(
                id__in=article_ids,
                feed__user_id__in=[user_id, None],
                feed__enabled=True,
            )
            .select_related("feed")
            .order_by("-date")
        )

    else:
        # Build query based on stream
        orchestrator = StreamFilterOrchestrator()
        conditions, _ = orchestrator.build_filters_for_ids(
            stream_id,
            user_id,
            exclude_read=(exclude_tag == "user/-/state/com.google/read"),
            include_tag=include_tag,
        )

        if not conditions:
            return format_stream_contents([], stream_id or "user/-/state/com.google/reading-list")

        articles = Article.objects.filter(conditions).select_related("feed")

        # Filter by timestamp
        if older_than:
            from datetime import datetime, timezone

            from_datetime = datetime.fromtimestamp(older_than, tz=timezone.utc)
            articles = articles.filter(date__lte=from_datetime)

        # Order
        articles = articles.order_by("-date")

    # Handle pagination
    offset = 0
    if continuation:
        try:
            offset = int(continuation)
        except ValueError:
            logger.warning(f"Invalid continuation token: {continuation}")

    # Get total for continuation
    total = articles.count()
    has_more = (offset + limit) < total

    # Get articles for this page
    articles = articles[offset : offset + limit]

    # Format items
    items = []
    for article in articles:
        item = format_stream_item(
            article,
            article.feed,
            request,
            is_read=article.read,
            is_starred=article.starred,
        )
        items.append(item)

    # Build response
    stream_name = stream_id or "user/-/state/com.google/reading-list"
    response = format_stream_contents(items, stream_name)

    # Add continuation if more results
    if has_more:
        response["continuation"] = str(offset + limit)

    return response


def invalidate_unread_cache(user_id: int | None = None) -> None:
    """Invalidate cached unread counts.

    Args:
        user_id: If provided, invalidate only for this user; else invalidate all
    """
    if user_id:
        cache.delete(f"greader:unread:{user_id}:False")
        cache.delete(f"greader:unread:{user_id}:True")
    else:
        # Invalidate all unread caches (crude but safe)
        cache.clear()

    logger.debug(f"Invalidated unread cache for user {user_id or 'all'}")
