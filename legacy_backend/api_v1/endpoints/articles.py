"""
Article management endpoints for API v1.

Provides operations for viewing and managing articles.
"""

import logging

from ninja import Router
from ninja.errors import HttpError
from ninja.pagination import paginate

from api_v1.pagination import CustomPageNumberPagination
from api_v1.schemas.articles import (
    ArticleDetailSchema,
    ArticleListItemSchema,
    ArticleOperationResponse,
    ArticleSchema,
    BulkOperationResponse,
    MarkReadRequest,
    MarkSavedRequest,
)
from core.services.article_service import ArticleService
from core.services.base import NotFoundError, PermissionDeniedError

logger = logging.getLogger(__name__)

router = Router()


def _handle_service_error(e: Exception):
    """Convert service exceptions to appropriate HTTP responses."""
    from django.http import Http404

    if isinstance(e, NotFoundError):
        raise Http404(str(e))
    elif isinstance(e, PermissionDeniedError):
        raise HttpError(403, str(e))
    raise e


@router.get("/feeds/{feed_id}/articles/", response=list[ArticleListItemSchema])
@paginate(CustomPageNumberPagination)
def list_articles(
    request,
    feed_id: int,
    search: str | None = None,
    unread_only: bool = False,
    read_state: str | None = None,
):
    """
    List articles from a specific feed.

    Args:
        feed_id: Feed ID
        search: Search query for article title or content
        unread_only: Show only unread articles (deprecated, use read_state instead)
        read_state: Filter by read state - 'read' for read articles, 'unread' for unread articles, or None for all

    Returns:
        Paginated list of articles
    """

    # Validate read_state parameter
    if read_state is not None:
        read_state_lower = read_state.lower()
        if read_state_lower not in ("read", "unread"):
            raise HttpError(
                400,
                f"Invalid read_state: '{read_state}'. Must be 'read', 'unread', or None",
            )
        read_state = read_state_lower

    article_service = ArticleService()
    try:
        # Return QuerySet directly - pagination decorator will handle slicing
        articles_queryset = article_service.list_articles(
            request.user,
            feed_id=feed_id,
            search=search,
            unread_only=unread_only,
            read_state=read_state,
        )

        # Return queryset for pagination, enrichment will be handled by the paginator
        return articles_queryset
    except Exception as e:
        _handle_service_error(e)


@router.get("/articles/", response=list[ArticleListItemSchema])
@paginate(CustomPageNumberPagination)
def list_articles_by_query(
    request,
    feed_id: int | None = None,
    search: str | None = None,
    unread_only: bool = False,
    read_state: str | None = None,
):
    """
    List all articles with pagination, search, and filtering.

    Supports filtering by feed and read state, plus full-text search.

    Args:
        feed_id: Optional feed ID to filter articles by feed
        search: Search query for article title or content
        unread_only: Show only unread articles (deprecated, use read_state instead)
        read_state: Filter by read state - 'read' for read articles, 'unread' for unread articles, or None for all

    Returns:
        Paginated list of articles with metadata (count, page, page_size, pages)
    """

    # Validate read_state parameter
    if read_state is not None:
        read_state_lower = read_state.lower()
        if read_state_lower not in ("read", "unread"):
            raise HttpError(
                400,
                f"Invalid read_state: '{read_state}'. Must be 'read', 'unread', or None",
            )
        read_state = read_state_lower

    article_service = ArticleService()
    try:
        # Return QuerySet directly - pagination decorator will handle slicing
        articles_queryset = article_service.list_articles(
            request.user,
            feed_id=feed_id,
            search=search,
            unread_only=unread_only,
            read_state=read_state,
        )

        # Return queryset for pagination, enrichment will be handled by the paginator
        return articles_queryset
    except Exception as e:
        _handle_service_error(e)


@router.post("/articles/mark-read/", response=BulkOperationResponse)
def mark_articles_read(request, data: MarkReadRequest):
    """
    Mark multiple articles as read or unread.

    Args:
        data: Article IDs and read status

    Returns:
        Count of articles updated
    """
    article_service = ArticleService()
    try:
        count = article_service.mark_articles_read(
            request.user, data.article_ids, data.is_read
        )
        status = "read" if data.is_read else "unread"
        return {
            "success": True,
            "message": f"Marked {count} articles as {status}",
            "count": count,
        }
    except Exception as e:
        _handle_service_error(e)


@router.post("/articles/mark-starred/", response=BulkOperationResponse)
def mark_articles_saved(request, data: MarkSavedRequest):
    """
    Mark multiple articles as saved or unsaved.

    Args:
        data: Article IDs and saved status

    Returns:
        Count of articles updated
    """
    article_service = ArticleService()
    try:
        count = article_service.mark_articles_saved(
            request.user, data.article_ids, data.is_saved
        )
        status = "saved" if data.is_saved else "unsaved"
        return {
            "success": True,
            "message": f"Marked {count} articles as {status}",
            "count": count,
        }
    except Exception as e:
        _handle_service_error(e)


@router.get("/articles/{article_id}/", response=ArticleDetailSchema)
def get_article(request, article_id: int, page: int = 1, unread_only: bool = False):
    """
    Get detailed article information with navigation.

    Args:
        article_id: Article ID
        page: Current page number (for navigation context)
        unread_only: Whether navigation should be in unread-only context

    Returns:
        Detailed article with prev/next navigation
    """
    article_service = ArticleService()
    try:
        article = article_service.get_article(article_id, request.user)

        # Get navigation
        prev_article, next_article = article_service.get_article_navigation(
            article, request.user, unread_only=unread_only
        )

        # Build response
        base_article_data = ArticleSchema.model_validate(article).model_dump()
        enrichment = article_service.enrich_article_data(article, request.user)

        article_dict = {
            **base_article_data,
            **enrichment,
            "feed_name": article.feed.name,
            "feed_icon": article.feed.icon or None,
            "prev_article_id": prev_article.id if prev_article else None,
            "next_article_id": next_article.id if next_article else None,
        }

        article_data = ArticleDetailSchema.model_validate(article_dict)

        # Mark as read automatically when viewing
        article_service.mark_article_read_on_view(article, request.user)

        return article_data
    except Exception as e:
        _handle_service_error(e)


@router.delete("/articles/{article_id}/", response=ArticleOperationResponse)
def delete_article(request, article_id: int):
    """
    Delete an article.

    Args:
        article_id: Article ID

    Returns:
        Success message
    """
    article_service = ArticleService()
    try:
        article_service.delete_article(article_id, request.user)
        return {
            "success": True,
            "message": "Article deleted successfully",
            "article_id": article_id,
        }
    except Exception as e:
        _handle_service_error(e)


@router.post("/articles/{article_id}/reload/", response=ArticleDetailSchema)
def reload_article(request, article_id: int):
    """
    Reload a single article (full refetch and re-extract content).

    Args:
        article_id: Article ID

    Returns:
        Updated article detail with refreshed content
    """
    article_service = ArticleService()
    try:
        article = article_service.reload_article(article_id, request.user)

        # Get navigation
        prev_article, next_article = article_service.get_article_navigation(
            article, request.user
        )

        # Build response
        base_article_data = ArticleSchema.model_validate(article).model_dump()
        enrichment = article_service.enrich_article_data(article, request.user)

        article_dict = {
            **base_article_data,
            **enrichment,
            "feed_name": article.feed.name,
            "feed_icon": article.feed.icon or None,
            "prev_article_id": prev_article.id if prev_article else None,
            "next_article_id": next_article.id if next_article else None,
        }

        return ArticleDetailSchema.model_validate(article_dict)
    except Exception as e:
        _handle_service_error(e)
