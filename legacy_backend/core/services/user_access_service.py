"""
Service for user access control and permission filtering.
"""

from django.contrib.auth import get_user_model
from django.db.models import Q, QuerySet

from core.models import Article, Feed
from core.services.base import BaseService, PermissionDeniedError

User = get_user_model()


class UserAccessService(BaseService):
    """
    Service for managing user access control.

    Handles filtering querysets based on user permissions and checking access.
    """

    def filter_feeds_queryset(self, queryset: QuerySet[Feed], user) -> QuerySet[Feed]:
        """
        Filter feeds queryset based on user permissions.

        - Superusers see all feeds
        - Regular users see their own feeds + shared feeds (user=None)

        Args:
            queryset: Base feeds queryset
            user: User object

        Returns:
            Filtered queryset
        """
        if user.is_superuser:
            return queryset
        return queryset.filter(Q(user=user) | Q(user__isnull=True))

    def filter_articles_queryset(
        self, queryset: QuerySet[Article], user
    ) -> QuerySet[Article]:
        """
        Filter articles queryset based on feed ownership.

        - Superusers see all articles
        - Regular users see articles from their own feeds + shared feeds (user=None)

        Args:
            queryset: Base articles queryset
            user: User object

        Returns:
            Filtered queryset
        """
        if user.is_superuser:
            return queryset
        return queryset.filter(Q(feed__user=user) | Q(feed__user__isnull=True))

    def can_access_feed(self, feed: Feed, user) -> bool:
        """
        Check if user can access a feed.

        Args:
            feed: Feed object
            user: User object

        Returns:
            True if user can access feed, False otherwise
        """
        if user.is_superuser:
            return True
        return feed.user == user or feed.user is None

    def can_access_article(self, article: Article, user) -> bool:
        """
        Check if user can access an article.

        Args:
            article: Article object
            user: User object

        Returns:
            True if user can access article, False otherwise
        """
        if user.is_superuser:
            return True
        return self.can_access_feed(article.feed, user)

    def check_feed_access(self, feed: Feed, user) -> None:
        """
        Check if user can access feed, raising exception if not.

        Args:
            feed: Feed object
            user: User object

        Raises:
            PermissionDeniedError: If user cannot access feed
        """
        if not self.can_access_feed(feed, user):
            raise PermissionDeniedError(
                f"User {user.username} does not have access to feed {feed.id}"
            )

    def check_article_access(self, article: Article, user) -> None:
        """
        Check if user can access article, raising exception if not.

        Args:
            article: Article object
            user: User object

        Raises:
            PermissionDeniedError: If user cannot access article
        """
        if not self.can_access_article(article, user):
            raise PermissionDeniedError(
                f"User {user.username} does not have access to article {article.id}"
            )
