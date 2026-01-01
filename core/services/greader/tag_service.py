"""Google Reader API tag service.

Handles tag operations: listing tags and marking articles with tags (read/starred).
"""

import logging
from typing import Any

from core.models import Article, Feed, FeedGroup

logger = logging.getLogger(__name__)


class TagError(Exception):
    """Tag operation failed."""
    pass


def list_tags(user_id: int) -> list[str]:
    """List all tags available for a user.

    Includes standard states and custom labels (groups).

    Args:
        user_id: Django user ID

    Returns:
        List of tag ID strings
    """
    tags = [
        "user/-/state/com.google/starred",
        "user/-/state/com.google/read",
        "user/-/state/com.google/reading-list",
        "user/-/state/com.google/kept-unread",
    ]

    # Add user's custom labels/groups
    groups = FeedGroup.objects.filter(user_id=user_id).order_by("name")
    for group in groups:
        tags.append(f"user/-/label/{group.name}")

    # Add special aggregator labels
    # Check if user has any Reddit feeds
    if Feed.objects.filter(user_id=user_id, aggregator="reddit", enabled=True).exists():
        tags.append("user/-/label/Reddit")

    # Check if user has any YouTube feeds
    if Feed.objects.filter(user_id=user_id, aggregator="youtube", enabled=True).exists():
        tags.append("user/-/label/YouTube")

    # Check if user has any Podcast feeds
    if Feed.objects.filter(user_id=user_id, aggregator="podcast", enabled=True).exists():
        tags.append("user/-/label/Podcasts")

    return tags


def edit_tags(
    user_id: int,
    item_ids: list[int] | list[str],
    add_tag: str = None,
    remove_tag: str = None,
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

    # Determine what state to set
    is_read = False
    is_saved = False

    if add_tag == "user/-/state/com.google/read":
        is_read = True
    elif add_tag == "user/-/state/com.google/starred":
        is_saved = True

    if remove_tag == "user/-/state/com.google/read":
        is_read = False
    elif remove_tag == "user/-/state/com.google/starred":
        is_saved = False

    # Update articles
    updated_count = 0
    for article in articles:
        if add_tag:
            _add_article_tag(article, add_tag)
            updated_count += 1
        if remove_tag:
            _remove_article_tag(article, remove_tag)
            updated_count += 1

    logger.info(f"User {user_id} updated {updated_count} articles with tags")

    return {
        "status": "ok",
        "updated": updated_count,
    }


def mark_all_as_read(
    user_id: int,
    stream_id: str = None,
    timestamp: int = None,
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
    from core.services.greader.stream_filter_builder import StreamFilterOrchestrator
    from datetime import datetime, timezone

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
