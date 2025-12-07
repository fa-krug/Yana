"""
Subscription service for Google Reader API.

Handles subscription listing, editing, and feed management.
"""

import logging
from urllib.parse import urlparse

from django.db.models import Prefetch, Q

from core.models import Feed
from core.services.base import (
    BaseService,
    NotFoundError,
    PermissionDeniedError,
    ValidationError,
)

from ..models import Group

logger = logging.getLogger(__name__)


class SubscriptionService(BaseService):
    """
    Service for handling subscriptions in Google Reader API.

    Handles:
    - Subscription listing
    - Subscription editing (rename, add/remove labels)
    - Unsubscribing
    - Feed icon and URL resolution
    """

    def list_subscriptions(self, user) -> list[dict]:
        """
        Get all feed subscriptions for a user.

        Args:
            user: The user

        Returns:
            List of subscription dictionaries in Google Reader API format
        """
        subscriptions = []

        # Add RSS feeds (prefetch groups to avoid N+1 queries)
        # Filter: user's own feeds + shared feeds (user=NULL)
        # Prefetch groups filtered by user to avoid showing other users' groups
        groups_prefetch = Prefetch(
            "groups",
            queryset=Group.objects.filter(Q(user=user) | Q(user__isnull=True)),
        )
        feeds = Feed.objects.prefetch_related(groups_prefetch).filter(
            Q(user=user) | Q(user__isnull=True), enabled=True
        )

        for feed in feeds:
            # Get categories (groups) for this feed
            # Groups are already filtered by the prefetch
            categories = []
            for group in feed.groups.all():
                categories.append(
                    {"id": f"user/-/label/{group.name}", "label": group.name}
                )

            # Build subscription object
            # Feeds with categories should only appear in those categories, not ungrouped
            subscription = {
                "id": f"feed/{feed.id}",
                "title": feed.name,
                "categories": categories,
                "url": feed.identifier,
                "htmlUrl": self._get_site_url(feed),
                "iconUrl": self._get_feed_icon(feed),
            }

            subscriptions.append(subscription)

        return subscriptions

    def edit_subscription(
        self,
        user,
        stream_id: str,
        action: str = "edit",
        new_title: str = "",
        add_label: str = "",
        remove_label: str = "",
    ) -> None:
        """
        Edit a subscription.

        Args:
            user: The user
            stream_id: Stream ID (e.g., "feed/123")
            action: Action to perform ("edit" or "unsubscribe")
            new_title: New title for the feed (optional)
            add_label: Label to add (optional)
            remove_label: Label to remove (optional)

        Raises:
            ValidationError: If parameters are invalid
            NotFoundError: If feed not found
            PermissionDeniedError: If user doesn't have permission
        """
        if not stream_id:
            raise ValidationError("Missing stream ID")

        if not stream_id.startswith("feed/"):
            raise ValidationError("Invalid stream ID")

        try:
            feed_id = int(stream_id[5:])
        except ValueError as e:
            raise ValidationError("Invalid stream ID") from e

        try:
            feed = Feed.objects.filter(Q(user=user) | Q(user__isnull=True)).get(
                id=feed_id
            )
        except Feed.DoesNotExist as e:
            raise NotFoundError("Feed not found") from e

        if action == "unsubscribe":
            if feed.user == user:
                feed.delete()
                self.logger.info(
                    f"User {user.username} unsubscribed from feed '{feed.name}'"
                )
            else:
                raise PermissionDeniedError("Cannot unsubscribe from shared feed")
        else:
            if new_title and feed.user == user:
                feed.name = new_title
                feed.save(update_fields=["name"])

            if add_label.startswith("user/-/label/"):
                label_name = add_label[13:]
                group, _ = Group.objects.get_or_create(
                    name=label_name, defaults={"user": user}
                )
                group.feeds.add(feed)

            if remove_label.startswith("user/-/label/"):
                label_name = remove_label[13:]
                try:
                    group = Group.objects.get(name=label_name)
                    group.feeds.remove(feed)
                except Group.DoesNotExist:
                    pass

    def _get_site_url(self, feed: Feed) -> str:
        """Get the site URL for a feed."""
        # Handle Reddit feeds
        if feed.feed_type == "reddit":
            from aggregators.reddit import normalize_subreddit

            subreddit_name = normalize_subreddit(feed.identifier)
            return f"https://www.reddit.com/r/{subreddit_name}"

        # Handle YouTube feeds
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

        # For regular RSS feeds, extract base URL from identifier
        if feed.identifier.startswith(("http://", "https://")):
            parsed = urlparse(feed.identifier)
            return f"{parsed.scheme}://{parsed.netloc}"

        return feed.identifier

    def _get_feed_icon(self, feed: Feed) -> str:
        """Get feed icon URL."""
        if feed.icon:
            return feed.icon

        if feed.feed_type == "youtube":
            return "https://www.youtube.com/s/desktop/favicon.ico"
        elif feed.feed_type == "reddit":
            return "https://www.reddit.com/favicon.ico"

        return ""
