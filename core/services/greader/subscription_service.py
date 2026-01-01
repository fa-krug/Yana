"""Google Reader API subscription service.

Handles subscription operations: listing, adding, removing, and managing labels.
"""

import logging
from typing import Any

from django.db import models

from core.models import Feed, FeedGroup

logger = logging.getLogger(__name__)


class SubscriptionError(Exception):
    """Subscription operation failed."""
    pass


class PermissionDenied(Exception):
    """User does not have permission to modify subscription."""
    pass


def list_subscriptions(user_id: int) -> list[dict[str, Any]]:
    """List all subscriptions (feeds) for a user.

    Includes feeds owned by the user plus shared feeds (user=NULL, enabled=True).

    Args:
        user_id: Django user ID

    Returns:
        List of subscription dicts with feed info and categories
    """
    # Get user's feeds plus shared feeds
    feeds = Feed.objects.filter(
        models.Q(user_id=user_id) | models.Q(user_id__isnull=True),
        enabled=True,
    ).select_related("group").order_by("name")

    subscriptions = []

    for feed in feeds:
        # Get categories (groups) for this feed
        categories = []

        if feed.group:
            categories.append({
                "id": f"user/-/label/{feed.group.name}",
                "label": feed.group.name,
            })

        # Add special categories based on aggregator type
        if feed.aggregator == "reddit":
            categories.append({
                "id": "user/-/label/Reddit",
                "label": "Reddit",
            })
        elif feed.aggregator == "youtube":
            categories.append({
                "id": "user/-/label/YouTube",
                "label": "YouTube",
            })
        elif feed.aggregator == "podcast":
            categories.append({
                "id": "user/-/label/Podcasts",
                "label": "Podcasts",
            })

        # Format subscription
        from core.services.greader.stream_format import format_subscription
        subscription = format_subscription(feed, categories)

        subscriptions.append(subscription)

    return subscriptions


def edit_subscription(user_id: int, options: dict[str, Any]) -> dict[str, Any]:
    """Edit a subscription (add, remove, or rename).

    Parameters:
        s: Stream ID (feed/{feed_id})
        ac: Action (subscribe, unsubscribe, edit)
        t: Title (for rename)
        a: Add labels (can be comma-separated or list)
        r: Remove labels (can be comma-separated or list)

    Args:
        user_id: Django user ID
        options: Dict with operation parameters

    Returns:
        Dict with result (should contain 'status': 'ok')

    Raises:
        SubscriptionError: If operation fails
        PermissionDenied: If user lacks permission
    """
    # Extract parameters
    stream_id = options.get("s", "")
    action = options.get("ac", "")
    title = options.get("t", "")
    add_labels = options.get("a", [])
    remove_labels = options.get("r", [])

    # Parse stream ID
    if not stream_id.startswith("feed/"):
        raise SubscriptionError("Invalid stream ID format")

    try:
        feed_id = int(stream_id.replace("feed/", ""))
    except ValueError:
        raise SubscriptionError("Invalid feed ID")

    # Get the feed
    try:
        feed = Feed.objects.get(id=feed_id)
    except Feed.DoesNotExist:
        raise SubscriptionError("Feed not found")

    # Check permission (user can only modify their own feeds or shared feeds)
    if feed.user and feed.user_id != user_id:
        raise PermissionDenied("Cannot modify other users' feeds")

    # Handle actions
    if action == "unsubscribe":
        # Only owner can unsubscribe
        if feed.user_id != user_id:
            raise PermissionDenied("Cannot unsubscribe from others' feeds")

        feed.enabled = False
        feed.save()
        logger.info(f"User {user_id} unsubscribed from feed {feed_id}")

    elif action == "edit":
        # Update title if provided
        if title:
            feed.name = title
            feed.save()
            logger.info(f"User {user_id} renamed feed {feed_id} to '{title}'")

        # Handle label additions
        if add_labels:
            _add_feed_to_labels(feed, user_id, add_labels)

        # Handle label removals
        if remove_labels:
            _remove_feed_from_labels(feed, user_id, remove_labels)

    elif action == "subscribe":
        # Re-enable if disabled
        feed.enabled = True
        feed.save()
        logger.info(f"User {user_id} resubscribed to feed {feed_id}")

    else:
        raise SubscriptionError(f"Unknown action: {action}")

    return {"status": "ok"}


def _add_feed_to_labels(feed: Feed, user_id: int, labels: list[str]) -> None:
    """Add a feed to one or more labels/groups.

    Args:
        feed: Feed instance
        user_id: Django user ID
        labels: List of label IDs (user/-/label/Name format)
    """
    # Normalize labels parameter
    if isinstance(labels, str):
        labels = [labels]

    for label in labels:
        label = label.strip()

        # Skip special labels (read-only)
        if label.startswith("user/-/state/com.google/"):
            continue

        # Parse label name
        if label.startswith("user/-/label/"):
            label_name = label.replace("user/-/label/", "")

            # Get or create group
            try:
                group = FeedGroup.objects.get(name=label_name, user_id=user_id)
            except FeedGroup.DoesNotExist:
                group = FeedGroup.objects.create(name=label_name, user_id=user_id)

            # Add feed to group
            feed.group = group
            feed.save()
            logger.info(f"Added feed {feed.id} to label '{label_name}'")


def _remove_feed_from_labels(feed: Feed, user_id: int, labels: list[str]) -> None:
    """Remove a feed from one or more labels/groups.

    Args:
        feed: Feed instance
        user_id: Django user ID
        labels: List of label IDs (user/-/label/Name format)
    """
    # Normalize labels parameter
    if isinstance(labels, str):
        labels = [labels]

    for label in labels:
        label = label.strip()

        # Parse label name
        if label.startswith("user/-/label/"):
            label_name = label.replace("user/-/label/", "")

            # Remove group if it matches
            if feed.group and feed.group.name == label_name:
                feed.group = None
                feed.save()
                logger.info(f"Removed feed {feed.id} from label '{label_name}'")


def get_subscription(user_id: int, feed_id: int) -> dict[str, Any]:
    """Get a single subscription by ID.

    Args:
        user_id: Django user ID
        feed_id: Feed ID

    Returns:
        Subscription dict

    Raises:
        SubscriptionError: If feed not found or not accessible
    """
    try:
        feed = Feed.objects.get(
            models.Q(id=feed_id),
            models.Q(user_id=user_id) | models.Q(user_id__isnull=True),
            enabled=True,
        )
    except Feed.DoesNotExist:
        raise SubscriptionError("Feed not found or not accessible")

    # Get categories
    categories = []
    if feed.group:
        categories.append({
            "id": f"user/-/label/{feed.group.name}",
            "label": feed.group.name,
        })

    from core.services.greader.stream_format import format_subscription
    return format_subscription(feed, categories)
