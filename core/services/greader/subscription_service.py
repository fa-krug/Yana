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


def list_subscriptions(user_id: int, request) -> list[dict[str, Any]]:
    """List all subscriptions (feeds) for a user.

    Includes feeds owned by the user plus shared feeds (user=NULL, enabled=True).

    Args:
        user_id: Django user ID
        request: Django request object

    Returns:
        List of subscription dicts with feed info and categories
    """
    # Get user's feeds plus shared feeds
    feeds = (
        Feed.objects.filter(
            models.Q(user_id=user_id) | models.Q(user_id__isnull=True),
            enabled=True,
        )
        .select_related("group")
        .order_by("name")
    )

    subscriptions = []

    for feed in feeds:
        # Get categories (groups) for this feed
        categories = []

        if feed.group:
            categories.append(
                {
                    "id": f"user/-/label/{feed.group.name}",
                    "label": feed.group.name,
                }
            )

        # Add special categories based on aggregator type
        if feed.aggregator == "reddit":
            categories.append(
                {
                    "id": "user/-/label/Reddit",
                    "label": "Reddit",
                }
            )
        elif feed.aggregator == "youtube":
            categories.append(
                {
                    "id": "user/-/label/YouTube",
                    "label": "YouTube",
                }
            )
        elif feed.aggregator == "podcast":
            categories.append(
                {
                    "id": "user/-/label/Podcasts",
                    "label": "Podcasts",
                }
            )

        # Format subscription
        from core.services.greader.stream_format import format_subscription

        subscription = format_subscription(feed, request, categories)

        subscriptions.append(subscription)

    return subscriptions


def edit_subscription(user_id: int, options: dict[str, Any]) -> dict[str, Any]:
    """Edit a subscription (add, remove, or rename).

    Parameters:
        s: Stream ID (feed/{feed_id} or feed/{url})
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

    stream_content = stream_id.replace("feed/", "")
    feed = None

    if stream_content.startswith("http"):
        # URL-based subscription
        url = stream_content
        feed = Feed.objects.filter(identifier=url, user_id=user_id).first()

        if not feed:
            if action == "subscribe":
                # Create new feed
                feed = Feed.objects.create(
                    name=title or url,
                    identifier=url,
                    aggregator="feed_content",  # Default to RSS
                    user_id=user_id,
                    enabled=True,
                )
                logger.info(f"User {user_id} created new subscription to {url}")
            else:
                raise SubscriptionError("Feed not found")
    else:
        # ID-based subscription
        try:
            feed_id = int(stream_content)
        except ValueError as e:
            raise SubscriptionError("Invalid feed ID") from e

        # Get the feed
        try:
            feed = Feed.objects.get(id=feed_id)
        except Feed.DoesNotExist as e:
            raise SubscriptionError("Feed not found") from e

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
        logger.info(f"User {user_id} unsubscribed from feed {feed.id}")

    elif action == "edit":
        # Update title if provided
        if title:
            feed.name = title
            feed.save()
            logger.info(f"User {user_id} renamed feed {feed.id} to '{title}'")

        # Handle label additions
        if add_labels:
            _add_feed_to_labels(feed, user_id, add_labels)

        # Handle label removals
        if remove_labels:
            _remove_feed_from_labels(feed, user_id, remove_labels)

    elif action == "subscribe":
        # Re-enable if disabled
        if not feed.enabled:
            feed.enabled = True
            feed.save()
            logger.info(f"User {user_id} resubscribed to feed {feed.id}")

        # Also handle title update during subscribe if provided
        if title and feed.name != title:
            feed.name = title
            feed.save()

    else:
        raise SubscriptionError(f"Unknown action: {action}")

    # Handle labels for subscribe action as well (common in QuickAdd)
    if action == "subscribe" and add_labels:
        _add_feed_to_labels(feed, user_id, add_labels)

    return {"status": "ok"}


def quick_add_subscription(user_id: int, url: str) -> dict[str, Any]:
    """Quickly add a subscription by URL.

    Args:
        user_id: Django user ID
        url: URL to subscribe to

    Returns:
        Dict with quickadd response format
    """
    # Check if feed exists
    feed = Feed.objects.filter(identifier=url, user_id=user_id).first()

    if not feed:
        # Create new feed
        feed = Feed.objects.create(
            name=url,
            identifier=url,
            aggregator="feed_content",
            user_id=user_id,
            enabled=True,
        )
        logger.info(f"User {user_id} quick-added subscription to {url}")
    else:
        # Enable if disabled
        if not feed.enabled:
            feed.enabled = True
            feed.save()
            logger.info(f"User {user_id} re-enabled subscription to {url}")

    return {
        "query": url,
        "numResults": 1,
        "streamId": f"feed/{feed.identifier}",
    }


def _add_feed_to_labels(feed: Feed, user_id: int, labels: list[str]) -> None:
    """Add a feed to one or more labels/groups (additive).

    Uses additive semantics: only sets the group if the feed doesn't already have one.

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

            # Only set group if feed doesn't already have one (additive semantics)
            if not feed.group:
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


def get_subscription(user_id: int, feed_id: int, request) -> dict[str, Any]:
    """Get a single subscription by ID.

    Args:
        user_id: Django user ID
        feed_id: Feed ID
        request: Django request object

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
    except Feed.DoesNotExist as e:
        raise SubscriptionError("Feed not found or not accessible") from e

    # Get categories
    categories = []
    if feed.group:
        categories.append(
            {
                "id": f"user/-/label/{feed.group.name}",
                "label": feed.group.name,
            }
        )

    from core.services.greader.stream_format import format_subscription

    return format_subscription(feed, request, categories)
