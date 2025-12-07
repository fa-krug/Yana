"""
Tag service for Google Reader API.

Handles tag operations including listing, editing, and mark all as read.
"""

import contextlib
import logging
from datetime import datetime

from django.db.models import Q
from django.utils import timezone

from core.models import Article
from core.services.base import BaseService

from ..models import Group, UserArticleState

logger = logging.getLogger(__name__)

# Standard Google Reader state tags
STATE_READ = "user/-/state/com.google/read"
STATE_STARRED = "user/-/state/com.google/starred"
STATE_READING_LIST = "user/-/state/com.google/reading-list"
STATE_KEPT_UNREAD = "user/-/state/com.google/kept-unread"


class TagService(BaseService):
    """
    Service for handling tags in Google Reader API.

    Handles:
    - Tag listing
    - Tag editing (mark as read/starred)
    - Mark all as read operations
    - Cache invalidation
    """

    def list_tags(self, user) -> list[dict]:
        """
        Get all available tags for a user.

        Args:
            user: The user

        Returns:
            List of tag dictionaries in Google Reader API format
        """
        tags = [
            {"id": STATE_STARRED},
            {"id": STATE_READ},
            {"id": STATE_READING_LIST},
            {"id": STATE_KEPT_UNREAD},
        ]

        groups = Group.objects.filter(Q(user=user) | Q(user__isnull=True))
        for group in groups:
            tags.append({"id": f"user/-/label/{group.name}"})

        return tags

    def edit_tags(
        self,
        user,
        item_ids: list[str],
        add_tag: str = "",
        remove_tag: str = "",
    ) -> int:
        """
        Modify item tags (read/unread/starred/unstarred) for articles.

        Args:
            user: The user
            item_ids: List of item IDs
            add_tag: Tag to add
            remove_tag: Tag to remove

        Returns:
            Number of articles updated
        """
        if not item_ids:
            return 0

        # Parse item IDs and filter out invalid ones (0 indicates parsing failure)
        article_ids = [
            aid for aid in [self._parse_item_id(i) for i in item_ids] if aid > 0
        ]

        # Determine update fields based on tags
        update_fields = {}
        if add_tag == STATE_READ:
            update_fields["is_read"] = True
        elif add_tag == STATE_STARRED:
            update_fields["is_saved"] = True
        if remove_tag == STATE_READ:
            update_fields["is_read"] = False
        elif remove_tag == STATE_STARRED:
            update_fields["is_saved"] = False

        # Early return if no valid article IDs or no update fields
        if not article_ids or not update_fields:
            return 0

        # Process articles in bulk
        updated_count = 0
        # Filter: only articles from user's enabled feeds + shared enabled feeds
        existing_articles = set(
            Article.objects.filter(id__in=article_ids)
            .filter(
                Q(feed__user=user) | Q(feed__user__isnull=True),
                feed__enabled=True,
            )
            .values_list("id", flat=True)
        )

        if existing_articles:
            # Get existing states
            existing_states = {
                s.article_id: s
                for s in UserArticleState.objects.filter(
                    user=user, article_id__in=existing_articles
                )
            }

            # Create new states for articles without existing state
            # Create state records whenever we're modifying tags (even if setting to False)
            new_states = []
            states_to_update = []
            states_to_delete = []
            for article_id in existing_articles:
                if article_id in existing_states:
                    state = existing_states[article_id]
                    for field, value in update_fields.items():
                        setattr(state, field, value)
                    # If both flags become false, delete the record
                    if not state.is_read and not state.is_saved:
                        states_to_delete.append(state.pk)
                    else:
                        states_to_update.append(state)
                else:
                    # Create state if we're modifying any tags
                    # Default to False if not in update_fields
                    is_read = update_fields.get("is_read", False)
                    is_saved = update_fields.get("is_saved", False)
                    # Only create state if we're setting something to True
                    # (False is the default, so no need to track it)
                    if is_read or is_saved:
                        new_state = UserArticleState(
                            user=user,
                            article_id=article_id,
                            is_read=is_read,
                            is_saved=is_saved,
                        )
                        new_states.append(new_state)

            # Bulk create, update, and delete
            if new_states:
                UserArticleState.objects.bulk_create(new_states, ignore_conflicts=True)
                updated_count += len(new_states)
            if states_to_update and update_fields:
                UserArticleState.objects.bulk_update(
                    states_to_update, list(update_fields.keys())
                )
                updated_count += len(states_to_update)
            if states_to_delete:
                UserArticleState.objects.filter(pk__in=states_to_delete).delete()
                updated_count += len(states_to_delete)

        # Invalidate unread counts cache after modifying read state
        self._invalidate_unread_cache(user)

        return updated_count

    def mark_all_as_read(
        self,
        user,
        stream_id: str,
        timestamp: str = "",
    ) -> int:
        """
        Mark all items in a stream as read.

        Args:
            user: The user
            stream_id: Stream ID (e.g., "feed/123", "user/-/label/MyLabel")
            timestamp: Optional timestamp (mark articles older than this)

        Returns:
            Number of articles marked as read
        """
        if not stream_id:
            return 0

        # Parse timestamp if provided
        ts_dt = None
        if timestamp:
            with contextlib.suppress(ValueError, TypeError):
                ts_dt = datetime.fromtimestamp(
                    int(timestamp), tz=timezone.get_current_timezone()
                )

        articles_marked = 0

        # Handle feed streams
        if stream_id.startswith("feed/"):
            try:
                feed_id = int(stream_id[5:])
                articles = Article.objects.filter(feed_id=feed_id).filter(
                    Q(feed__user=user) | Q(feed__user__isnull=True),
                    feed__enabled=True,
                )
                if ts_dt:
                    articles = articles.filter(date__lte=ts_dt)
                articles_marked = self._bulk_mark_articles_as_read(user, articles)
            except ValueError:
                pass

        # Handle label streams
        elif stream_id.startswith("user/-/label/"):
            label_name = stream_id[13:]

            if label_name == "Reddit":
                articles = Article.objects.filter(feed__feed_type="reddit").filter(
                    Q(feed__user=user) | Q(feed__user__isnull=True),
                    feed__enabled=True,
                )
                if ts_dt:
                    articles = articles.filter(date__lte=ts_dt)
                articles_marked = self._bulk_mark_articles_as_read(user, articles)
            elif label_name == "YouTube":
                articles = Article.objects.filter(feed__feed_type="youtube").filter(
                    Q(feed__user=user) | Q(feed__user__isnull=True),
                    feed__enabled=True,
                )
                if ts_dt:
                    articles = articles.filter(date__lte=ts_dt)
                articles_marked = self._bulk_mark_articles_as_read(user, articles)
            elif label_name == "Podcasts":
                articles = Article.objects.filter(feed__feed_type="podcast").filter(
                    Q(feed__user=user) | Q(feed__user__isnull=True),
                    feed__enabled=True,
                )
                if ts_dt:
                    articles = articles.filter(date__lte=ts_dt)
                articles_marked = self._bulk_mark_articles_as_read(user, articles)
            else:
                try:
                    group = Group.objects.filter(
                        Q(user=user) | Q(user__isnull=True)
                    ).get(name=label_name)

                    feed_ids = group.feeds.filter(
                        Q(user=user) | Q(user__isnull=True), enabled=True
                    ).values_list("id", flat=True)
                    articles = Article.objects.filter(feed_id__in=feed_ids)
                    if ts_dt:
                        articles = articles.filter(date__lte=ts_dt)
                    articles_marked = self._bulk_mark_articles_as_read(user, articles)
                except Group.DoesNotExist:
                    pass

        self.logger.debug(
            f"Marked {articles_marked} articles as read for {user.username}"
        )

        # Invalidate unread counts cache
        self._invalidate_unread_cache(user)

        return articles_marked

    def _bulk_mark_articles_as_read(self, user, articles_queryset):
        """Helper to bulk mark articles as read."""
        article_ids = list(articles_queryset.values_list("id", flat=True))
        if not article_ids:
            return 0

        # Get existing states
        existing_states = {
            s.article_id: s
            for s in UserArticleState.objects.filter(
                user=user, article_id__in=article_ids
            )
        }

        # Prepare bulk operations
        new_states = []
        states_to_update = []
        for article_id in article_ids:
            if article_id in existing_states:
                state = existing_states[article_id]
                if not state.is_read:
                    state.is_read = True
                    states_to_update.append(state)
            else:
                new_states.append(
                    UserArticleState(user=user, article_id=article_id, is_read=True)
                )

        # Execute bulk operations
        if new_states:
            UserArticleState.objects.bulk_create(new_states, ignore_conflicts=True)
        if states_to_update:
            UserArticleState.objects.bulk_update(states_to_update, ["is_read"])

        return len(new_states) + len(states_to_update)

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

    def _invalidate_unread_cache(self, user) -> None:
        """Invalidate unread counts cache for a user."""
        self._cache_delete(f"unread_counts_{user.pk}_False")
        self._cache_delete(f"unread_counts_{user.pk}_True")
