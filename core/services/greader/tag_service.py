"""Google Reader API tag service.

Handles tag operations: listing tags and marking articles with tags (read/starred).
"""

import logging
from typing import Any, List, Optional, Union

from core.models import Article, FeedGroup

logger = logging.getLogger(__name__)


class TagError(Exception):
    """Tag operation failed."""

    pass


def list_tags(user_id: int) -> list[dict[str, str]]:
    """List all tags available for a user.

    Includes standard states and custom labels (groups).

    Args:
        user_id: Django user ID

    Returns:
        List of tag objects with id field
    """
    tags = [
        {"id": "user/-/state/com.google/starred"},
        {"id": "user/-/state/com.google/read"},
        {"id": "user/-/state/com.google/reading-list"},
        {"id": "user/-/state/com.google/kept-unread"},
    ]

    # Add user's custom labels/groups
    groups = FeedGroup.objects.filter(user_id=user_id).order_by("name")
    for group in groups:
        tags.append({"id": f"user/-/label/{group.name}"})

    return tags


def edit_tags(
    user_id: int,
    item_ids: Union[List[int], List[str]],
    add_tag: Optional[str] = None,
    remove_tag: Optional[str] = None,
) -> dict[str, Any]:
    """Mark articles with tags (read/starred).

    Args:
        user_id: Django user ID
        item_ids: List of article IDs (int or hex string)
        add_tag: Tag to add (e.g., 'user/-/state/com.google/read')
        remove_tag: Tag to remove

    Returns:
        Dict with operation result

    Raises:
        TagError: If operation fails
    """
    # Parse item IDs
    from core.services.greader.stream_format import parse_item_id

    article_ids = []
    for item_id in item_ids:
        try:
            article_id = parse_item_id(str(item_id))
            article_ids.append(article_id)
        except ValueError as e:
            logger.warning(f"Invalid item ID: {item_id}, error: {e}")
            continue

    if not article_ids:
        raise TagError("No valid article IDs provided")

    # Get accessible articles
    articles = Article.objects.filter(
        id__in=article_ids,
        feed__user_id__in=[user_id, None],  # User's articles or shared articles
        feed__enabled=True,
    )

    if not articles.exists():
        raise TagError("No accessible articles found")

    # Update articles
    updated_count = 0
    for article in articles:
        if add_tag:
            _add_article_tag(article, add_tag)
            updated_count += 1
        if remove_tag:
            _remove_article_tag(article, remove_tag)
            updated_count += 1

    if updated_count > 0:
        from core.services.greader.stream_service import invalidate_unread_cache

        invalidate_unread_cache(user_id)

    logger.info(f"User {user_id} updated {updated_count} articles with tags")

    return {
        "status": "ok",
        "updated": updated_count,
    }


def mark_all_as_read(
    user_id: int,
    stream_id: Optional[str] = None,
    timestamp: Optional[int] = None,
) -> dict[str, Any]:
    """Mark all articles in a stream as read.

    Args:
        user_id: Django user ID
        stream_id: Stream ID (feed/123, user/-/label/Name, etc.) or None for all
        timestamp: Optional timestamp - mark articles older than this (seconds)

    Returns:
        Dict with operation result

    Raises:
        TagError: If operation fails
    """
    from datetime import datetime, timezone

    from core.services.greader.stream_filter_builder import StreamFilterOrchestrator

    # Build query based on stream filter
    orchestrator = StreamFilterOrchestrator()
    conditions, needs_join = orchestrator.build_filter(stream_id or "", user_id)

    # Start with base query
    articles = Article.objects.all()

    # Apply stream-based conditions
    if conditions:
        articles = articles.filter(conditions)

    # Filter by feed access
    articles = articles.filter(
        feed__user_id__in=[user_id, None],  # User's articles or shared
        feed__enabled=True,
    )

    # Filter by timestamp if provided
    if timestamp:
        from_datetime = datetime.fromtimestamp(timestamp, tz=timezone.utc)
        articles = articles.filter(date__lte=from_datetime)

    # Update all matching articles
    updated_count = articles.update(read=True)

    if updated_count > 0:
        from core.services.greader.stream_service import invalidate_unread_cache

        invalidate_unread_cache(user_id)

    logger.info(f"User {user_id} marked {updated_count} articles as read in stream {stream_id}")

    return {
        "status": "ok",
        "updated": updated_count,
    }


def _add_article_tag(article: Article, tag: str) -> None:
    """Add a tag to an article.

    Args:
        article: Article instance
        tag: Tag ID
    """
    if tag == "user/-/state/com.google/read":
        article.read = True
        article.save(update_fields=["read"])
    elif tag == "user/-/state/com.google/starred":
        article.starred = True
        article.save(update_fields=["starred"])


def _remove_article_tag(article: Article, tag: str) -> None:
    """Remove a tag from an article.

    Args:
        article: Article instance
        tag: Tag ID
    """
    if tag == "user/-/state/com.google/read":
        article.read = False
        article.save(update_fields=["read"])
    elif tag == "user/-/state/com.google/starred":
        article.starred = False
        article.save(update_fields=["starred"])
