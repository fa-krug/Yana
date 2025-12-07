"""
Statistics endpoints for API v1.

Provides dashboard statistics and metrics.
"""

import logging
from datetime import timedelta

from django.core.cache import cache
from django.db.models import Count, Exists, OuterRef, Q
from django.utils import timezone
from ninja import Router

from api.models import UserArticleState
from api_v1.schemas.statistics import StatisticsSchema
from core.models import Article, Feed
from core.services.user_access_service import UserAccessService

logger = logging.getLogger(__name__)

router = Router()


@router.get("/", response=StatisticsSchema)
def get_statistics(request):
    """
    Get dashboard statistics for the current user.

    Returns:
        Statistics including feed counts, article counts, and read percentages

    Cached for 60 seconds per user to reduce database load.
    """
    # Cache key includes user ID to ensure user-specific caching
    user_id = request.user.id if request.user.is_authenticated else "anonymous"
    cache_key = f"statistics_{user_id}"

    # Try to get from cache
    cached_result = cache.get(cache_key)
    if cached_result is not None:
        logger.debug(f"Returning cached statistics for user {user_id}")
        return StatisticsSchema(**cached_result)

    # Get feeds accessible to user
    user_access_service = UserAccessService()
    feeds_queryset = user_access_service.filter_feeds_queryset(
        Feed.objects.all(), request.user
    )

    # Get feed IDs for article filtering (more efficient than using queryset directly)
    feed_ids = list(feeds_queryset.values_list("id", flat=True))

    # Get all articles from accessible feeds with optimized annotations
    articles_queryset = Article.objects.filter(feed_id__in=feed_ids)

    # Use subquery for unread count (more efficient than exclude(id__in=...))
    if request.user.is_authenticated:
        read_subquery = UserArticleState.objects.filter(
            user=request.user,
            article_id=OuterRef("pk"),
            is_read=True,
        )
        # Annotate articles with read status, then aggregate
        articles_with_status = articles_queryset.annotate(
            is_read_annotated=Exists(read_subquery)
        )

        # Calculate counts in a single aggregation
        stats = articles_with_status.aggregate(
            total=Count("id"),
            unread=Count("id", filter=Q(is_read_annotated=False)),
        )
        total_articles = stats["total"]
        total_unread = stats["unread"]
    else:
        total_articles = articles_queryset.count()
        total_unread = total_articles

    # Calculate read percentage
    if total_articles > 0:
        read_percentage = int(((total_articles - total_unread) / total_articles) * 100)
    else:
        read_percentage = 0

    # Recent activity - calculate in single query
    now = timezone.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)

    recent_stats = articles_queryset.aggregate(
        today=Count("id", filter=Q(created_at__gte=today_start)),
        this_week=Count("id", filter=Q(created_at__gte=week_start)),
    )
    articles_today = recent_stats["today"]
    articles_this_week = recent_stats["this_week"]

    # Feed type breakdown and total feeds - combine into single query
    feed_stats = feeds_queryset.aggregate(
        total=Count("id"),
    )
    total_feeds = feed_stats["total"]

    # Feed type breakdown
    feed_types = feeds_queryset.values("feed_type").annotate(count=Count("id"))
    feed_type_counts = {ft["feed_type"]: ft["count"] for ft in feed_types}

    result = StatisticsSchema(
        total_feeds=total_feeds,
        total_articles=total_articles,
        total_unread=total_unread,
        read_percentage=read_percentage,
        article_feeds=feed_type_counts.get("article", 0),
        video_feeds=feed_type_counts.get("youtube", 0),
        podcast_feeds=feed_type_counts.get("podcast", 0),
        reddit_feeds=feed_type_counts.get("reddit", 0),
        articles_today=articles_today,
        articles_this_week=articles_this_week,
    )

    # Cache for 60 seconds
    cache.set(cache_key, result.model_dump(), 60)
    logger.debug(f"Cached statistics for user {user_id}")

    return result
