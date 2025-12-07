"""
Feed management endpoints for API v1.

Provides CRUD operations and actions for feeds.
"""

import logging

from django.db.models import Count, Exists, OuterRef
from ninja import Router
from ninja.pagination import paginate

from api.models import UserArticleState
from api_v1.pagination import CustomPageNumberPagination
from api_v1.schemas.feeds import (
    FeedCreateRequest,
    FeedDetailSchema,
    FeedOperationResponse,
    FeedPreviewRequest,
    FeedPreviewResponse,
    FeedReloadResponse,
    FeedSchema,
    FeedUpdateRequest,
)
from core.models import Feed
from core.services.base import NotFoundError, PermissionDeniedError, ValidationError
from core.services.feed_service import FeedService

logger = logging.getLogger(__name__)

router = Router()


def _handle_service_error(e: Exception):
    """Convert service exceptions to appropriate HTTP responses."""
    from django.http import Http404
    from ninja.errors import HttpError

    if isinstance(e, NotFoundError):
        raise Http404(str(e))
    elif isinstance(e, PermissionDeniedError):
        raise HttpError(403, str(e))
    elif isinstance(e, ValidationError):
        raise HttpError(400, str(e))
    raise e


@router.get("/", response=list[FeedSchema])
@paginate(CustomPageNumberPagination)
def list_feeds(
    request,
    search: str | None = None,
    feed_type: str | None = None,
    enabled: bool | None = None,
):
    """
    List all feeds with optional filtering and pagination.

    Args:
        search: Search query for feed name
        feed_type: Filter by feed type (article, youtube, podcast, reddit)
        enabled: Filter by enabled status

    Returns:
        Paginated list of feeds with article counts
    """
    feed_service = FeedService()
    try:
        feeds = feed_service.list_feeds(
            request.user, search=search, feed_type=feed_type, enabled=enabled
        )

        # Convert to response format
        feed_list = []
        for feed in feeds:
            feed_data = FeedSchema.model_validate(feed)
            # Use annotated counts (already calculated efficiently)
            feed_data.article_count = getattr(feed, "article_count", 0)
            feed_data.unread_count = getattr(feed, "unread_count", 0)

            feed_list.append(feed_data)

        return feed_list
    except Exception as e:
        _handle_service_error(e)


@router.post("/preview/", response=FeedPreviewResponse)
def preview_feed(request, data: FeedPreviewRequest):
    """
    Preview a feed configuration by fetching the first article with full content.

    Args:
        data: Feed configuration to test

    Returns:
        First article with full content or error message
    """
    feed_service = FeedService()
    try:
        preview_data = feed_service.preview_feed(data.model_dump())
        return FeedPreviewResponse(**preview_data)
    except Exception as e:
        _handle_service_error(e)


@router.get("/{feed_id}/", response=FeedDetailSchema)
def get_feed(request, feed_id: int):
    """
    Get detailed information about a specific feed.

    Args:
        feed_id: Feed ID

    Returns:
        Detailed feed information including metadata
    """
    feed_service = FeedService()
    try:
        feed = feed_service.get_feed(feed_id, request.user)

        # Get aggregator metadata
        metadata = feed_service.get_feed_aggregator_metadata(feed)

        # Build response
        feed_data = FeedDetailSchema.model_validate(feed)
        feed_data.aggregator_metadata = metadata

        # Annotate counts efficiently
        feed_with_counts = Feed.objects.filter(id=feed.id).annotate(
            article_count=Count("articles")
        )

        if request.user.is_authenticated:
            read_subquery = UserArticleState.objects.filter(
                user=request.user,
                article_id=OuterRef("articles__id"),
                is_read=True,
            )
            feed_with_counts = feed_with_counts.annotate(
                unread_count=Count(
                    "articles",
                    filter=~Exists(read_subquery),
                    distinct=True,
                )
            )
        else:
            feed_with_counts = feed_with_counts.annotate(unread_count=Count("articles"))

        feed_with_counts = feed_with_counts.first()
        feed_data.article_count = (
            feed_with_counts.article_count if feed_with_counts else 0
        )
        feed_data.unread_count = getattr(feed_with_counts, "unread_count", 0)

        return feed_data
    except Exception as e:
        _handle_service_error(e)


@router.post("/", response=FeedSchema)
def create_feed(request, data: FeedCreateRequest):
    """
    Create a new feed.

    Args:
        data: Feed creation data

    Returns:
        Created feed
    """
    feed_service = FeedService()
    try:
        feed = feed_service.create_feed(request.user, data.model_dump())
        return FeedSchema.model_validate(feed)
    except Exception as e:
        _handle_service_error(e)


@router.patch("/{feed_id}/", response=FeedSchema)
def update_feed(request, feed_id: int, data: FeedUpdateRequest):
    """
    Update an existing feed.

    Args:
        feed_id: Feed ID
        data: Updated feed data

    Returns:
        Updated feed with article counts
    """
    feed_service = FeedService()
    try:
        # Convert Pydantic model to dict, excluding None values
        update_data = {k: v for k, v in data.model_dump().items() if v is not None}
        feed = feed_service.update_feed(feed_id, request.user, update_data)

        # Annotate with article counts before returning
        feed_with_counts = Feed.objects.filter(id=feed.id).annotate(
            article_count=Count("articles")
        )

        if request.user.is_authenticated:
            read_subquery = UserArticleState.objects.filter(
                user=request.user,
                article_id=OuterRef("articles__id"),
                is_read=True,
            )
            feed_with_counts = feed_with_counts.annotate(
                unread_count=Count(
                    "articles",
                    filter=~Exists(read_subquery),
                    distinct=True,
                )
            )
        else:
            feed_with_counts = feed_with_counts.annotate(unread_count=Count("articles"))

        feed_with_counts = feed_with_counts.first()
        feed_data = FeedSchema.model_validate(feed)
        feed_data.article_count = (
            feed_with_counts.article_count if feed_with_counts else 0
        )
        feed_data.unread_count = getattr(feed_with_counts, "unread_count", 0)

        return feed_data
    except Exception as e:
        _handle_service_error(e)


@router.delete("/{feed_id}/", response=FeedOperationResponse)
def delete_feed(request, feed_id: int):
    """
    Delete a feed and all its articles.

    Args:
        feed_id: Feed ID

    Returns:
        Success message
    """
    feed_service = FeedService()
    try:
        feed = feed_service.get_feed(feed_id, request.user)
        feed_name = feed.name
        feed_service.delete_feed(feed_id, request.user)
        return {
            "success": True,
            "message": f"Feed '{feed_name}' deleted successfully",
            "feed_id": feed_id,
        }
    except Exception as e:
        _handle_service_error(e)


@router.post("/{feed_id}/reload/", response=FeedReloadResponse)
def reload_feed(request, feed_id: int, force: bool = False):
    """
    Reload a feed (fetch new articles).

    Args:
        feed_id: Feed ID
        force: If True, force re-download of all articles

    Returns:
        Reload statistics
    """
    feed_service = FeedService()
    try:
        result = feed_service.reload_feed(feed_id, request.user, force=force)
        return FeedReloadResponse(**result)
    except Exception as e:
        _handle_service_error(e)


@router.post("/{feed_id}/clear/", response=FeedOperationResponse)
def clear_feed(request, feed_id: int):
    """
    Clear all articles from a feed.

    Args:
        feed_id: Feed ID

    Returns:
        Success message
    """
    feed_service = FeedService()
    try:
        result = feed_service.clear_feed_articles(feed_id, request.user)
        return FeedOperationResponse(**result)
    except Exception as e:
        _handle_service_error(e)
