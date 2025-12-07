"""
Service for article management operations.
"""

import logging
from typing import Any

from django.core.cache import cache
from django.db.models import Q

from api.models import UserArticleState
from core.models import Article
from core.services.base import BaseService, NotFoundError
from core.services.user_access_service import UserAccessService

logger = logging.getLogger(__name__)


class ArticleService(BaseService):
    """
    Service for managing articles.

    Handles CRUD operations, state management (read/saved), filtering, and navigation.
    """

    def __init__(self):
        """Initialize the service."""
        super().__init__()
        self.user_access_service = UserAccessService()

    def get_article(self, article_id: int, user) -> Article:
        """
        Get an article by ID with permission check.

        Args:
            article_id: Article ID
            user: User requesting the article

        Returns:
            Article object

        Raises:
            NotFoundError: If article not found
            PermissionDeniedError: If user cannot access article
        """
        queryset = self.user_access_service.filter_articles_queryset(
            Article.objects.select_related("feed"), user
        )
        article = queryset.filter(id=article_id).first()

        if not article:
            raise NotFoundError(f"Article with ID {article_id} not found")

        return article

    def list_articles(
        self,
        user,
        feed_id: int | None = None,
        search: str | None = None,
        unread_only: bool = False,
        read_state: str | None = None,
    ):
        """
        List articles with optional filtering.

        Args:
            user: User requesting articles
            feed_id: Optional feed ID to filter articles
            search: Search query for article title or content
            unread_only: Show only unread articles (deprecated, use read_state instead)
            read_state: Filter by read state: 'read', 'unread', or None (all)

        Returns:
            QuerySet of Article objects ordered by date (newest first)
        """
        from core.models import Feed

        # Get user's accessible feeds
        feeds_queryset = self.user_access_service.filter_feeds_queryset(
            Feed.objects.all(), user
        )

        # Filter by feed if specified
        if feed_id:
            feed = feeds_queryset.filter(id=feed_id).first()
            if not feed:
                return []
            queryset = Article.objects.filter(feed=feed).select_related("feed")
        else:
            # Get articles from all user's feeds
            queryset = Article.objects.filter(feed__in=feeds_queryset).select_related(
                "feed"
            )

        # Apply permission filtering
        queryset = self.user_access_service.filter_articles_queryset(queryset, user)

        # Apply search filter
        search_in_content = False
        if search:
            # Check if search might match content (simple heuristic)
            search_in_content = (
                len(search) > 3
            )  # Only search content for longer queries
            if search_in_content:
                queryset = queryset.filter(
                    Q(name__icontains=search) | Q(content__icontains=search)
                )
            else:
                queryset = queryset.filter(name__icontains=search)

        # Exclude content field for list views (large field, not needed)
        # Only defer if we're not searching in content
        if not search_in_content:
            queryset = queryset.defer("content")

        # Determine read state filter (read_state takes precedence over unread_only)
        read_filter = None
        if read_state:
            read_filter = read_state.lower()
        elif unread_only:
            read_filter = "unread"

        # Apply read state filter using Exists subquery (more efficient than exclude(id__in=...))
        if read_filter and user.is_authenticated:
            from django.db.models import Exists, OuterRef

            read_subquery = UserArticleState.objects.filter(
                user=user,
                article_id=OuterRef("pk"),
                is_read=True,
            )
            if read_filter == "unread":
                queryset = queryset.exclude(Exists(read_subquery))
            elif read_filter == "read":
                queryset = queryset.filter(Exists(read_subquery))

        # Annotate with user state (is_read, is_saved) for pagination-friendly enrichment
        if user.is_authenticated:
            from django.db.models import Case, Exists, OuterRef, Value, When

            read_subquery = UserArticleState.objects.filter(
                user=user,
                article_id=OuterRef("pk"),
                is_read=True,
            )
            saved_subquery = UserArticleState.objects.filter(
                user=user,
                article_id=OuterRef("pk"),
                is_saved=True,
            )
            queryset = queryset.annotate(
                is_read=Case(
                    When(Exists(read_subquery), then=Value(True)),
                    default=Value(False),
                ),
                is_saved=Case(
                    When(Exists(saved_subquery), then=Value(True)),
                    default=Value(False),
                ),
            )
        else:
            # For anonymous users, annotate with False values
            from django.db.models import Value

            queryset = queryset.annotate(
                is_read=Value(False),
                is_saved=Value(False),
            )

        return queryset.order_by("-date")

    def delete_article(self, article_id: int, user) -> None:
        """
        Delete an article.

        Args:
            article_id: Article ID
            user: User deleting the article

        Raises:
            NotFoundError: If article not found
            PermissionDeniedError: If user cannot delete article
        """
        article = self.get_article(article_id, user)

        article_name = article.name
        feed_user_id = article.feed.user.id if article.feed.user else None
        article.delete()

        self.logger.info(
            f"Deleted article '{article_name}' (ID: {article_id}) by user {user.username}"
        )

        # Invalidate statistics cache (article count changed)
        cache.delete("statistics_anonymous")
        if feed_user_id:
            cache.delete(f"statistics_{feed_user_id}")
        if user.is_authenticated and user.id != feed_user_id:
            cache.delete(f"statistics_{user.id}")

    def get_article_read_state(self, article: Article, user) -> tuple[bool, bool]:
        """
        Get read and saved state for an article.

        Args:
            article: Article object
            user: User object

        Returns:
            Tuple of (is_read, is_saved)
        """
        if not user.is_authenticated:
            return False, False

        try:
            state = UserArticleState.objects.get(user=user, article=article)
            return state.is_read, state.is_saved
        except UserArticleState.DoesNotExist:
            return False, False

    def mark_articles_read(self, user, article_ids: list[int], is_read: bool) -> int:
        """
        Mark multiple articles as read or unread.

        Args:
            user: User marking articles
            article_ids: List of article IDs
            is_read: True to mark as read, False to mark as unread

        Returns:
            Number of articles updated
        """
        count = 0

        # Filter articles user has access to
        accessible_articles = Article.objects.filter(id__in=article_ids)
        accessible_articles = self.user_access_service.filter_articles_queryset(
            accessible_articles, user
        )

        for article in accessible_articles:
            UserArticleState.objects.update_or_create(
                user=user,
                article=article,
                defaults={"is_read": is_read},
            )
            count += 1

        status = "read" if is_read else "unread"
        self.logger.info(
            f"Marked {count} articles as {status} for user {user.username}"
        )

        # Invalidate statistics cache for this user
        if user.is_authenticated:
            cache.delete(f"statistics_{user.id}")

        return count

    def mark_articles_saved(self, user, article_ids: list[int], is_saved: bool) -> int:
        """
        Mark multiple articles as saved or unsaved.

        Args:
            user: User marking articles
            article_ids: List of article IDs
            is_saved: True to mark as saved, False to mark as unsaved

        Returns:
            Number of articles updated
        """
        count = 0

        # Filter articles user has access to
        accessible_articles = Article.objects.filter(id__in=article_ids)
        accessible_articles = self.user_access_service.filter_articles_queryset(
            accessible_articles, user
        )

        for article in accessible_articles:
            UserArticleState.objects.update_or_create(
                user=user,
                article=article,
                defaults={"is_saved": is_saved},
            )
            count += 1

        status = "saved" if is_saved else "unsaved"
        self.logger.info(
            f"Marked {count} articles as {status} for user {user.username}"
        )

        # Note: Statistics cache doesn't need invalidation for saved state changes
        # as statistics don't include saved counts

        return count

    def get_article_navigation(
        self, article: Article, user, unread_only: bool = False
    ) -> tuple[Article | None, Article | None]:
        """
        Get previous and next articles for navigation.

        Args:
            article: Current article
            user: User requesting navigation
            unread_only: Whether navigation should be in unread-only context

        Returns:
            Tuple of (prev_article, next_article)
        """
        # Get base queryset for navigation
        nav_queryset = Article.objects.filter(feed=article.feed)

        # Apply permission filtering
        nav_queryset = self.user_access_service.filter_articles_queryset(
            nav_queryset, user
        )

        # Apply unread filter for navigation using Exists subquery
        if unread_only and user.is_authenticated:
            from django.db.models import Exists, OuterRef

            read_subquery = UserArticleState.objects.filter(
                user=user,
                article_id=OuterRef("pk"),
                is_read=True,
            )
            nav_queryset = nav_queryset.exclude(Exists(read_subquery))

        # Get prev/next articles
        prev_article = nav_queryset.filter(
            Q(date__lt=article.date) | Q(date=article.date, id__lt=article.id)
        ).first()
        next_article = nav_queryset.filter(
            Q(date__gt=article.date) | Q(date=article.date, id__gt=article.id)
        ).last()

        return prev_article, next_article

    def mark_article_read_on_view(self, article: Article, user) -> None:
        """
        Mark an article as read when viewed.

        Args:
            article: Article object
            user: User viewing the article
        """
        if user.is_authenticated:
            UserArticleState.objects.update_or_create(
                user=user,
                article=article,
                defaults={"is_read": True},
            )

    def reload_article(self, article_id: int, user) -> Article:
        """
        Reload a single article (full refetch and re-extract content).

        Args:
            article_id: Article ID
            user: User requesting reload

        Returns:
            Updated Article object

        Raises:
            NotFoundError: If article not found
            PermissionDeniedError: If user cannot access article
        """
        from core.services.aggregation_service import AggregationService

        article = self.get_article(article_id, user)

        aggregation_service = AggregationService()
        success = aggregation_service.reload_article(article)
        if not success:
            raise Exception("Failed to reload article content")

        # Refresh article from database to get updated timestamp
        article.refresh_from_db()

        self.logger.info(f"Reloaded article '{article.name}' (ID: {article_id})")

        return article

    def enrich_article_data(
        self, article: Article, user, read_state: dict | None = None
    ) -> dict[str, Any]:
        """
        Add computed fields and read state to article data.

        Args:
            article: Article object
            user: User object
            read_state: Optional pre-fetched read state dict with 'is_read' and 'is_saved' keys.
                       If provided, avoids database query.

        Returns:
            Dictionary with enriched article data
        """
        # Get read state (use provided state or fetch)
        if read_state is not None:
            is_read = read_state.get("is_read", False)
            is_saved = read_state.get("is_saved", False)
        else:
            is_read, is_saved = self.get_article_read_state(article, user)

        # Get properties from article model
        return {
            "is_video": article.is_video,
            "is_podcast": article.is_podcast,
            "is_reddit": article.is_reddit,
            "has_media": article.has_media,
            "duration_formatted": article.duration_formatted,
            "is_read": is_read,
            "is_saved": is_saved,
        }
