"""
Django-Q2 tasks for scheduled aggregation.
"""

import logging
from datetime import timedelta

from django.utils import timezone
from django_q.models import Failure, Success

from api.models import UserArticleState
from core.models import Article, Feed
from core.services.aggregation_service import AggregationService
from core.services.icon_service import IconService

logger = logging.getLogger(__name__)


def fetch_feed_favicon(feed_id: int) -> bool:
    """
    Fetch and update icon for a feed.

    This task is run asynchronously when a feed is created without an icon.
    Handles different feed types: regular RSS feeds, Reddit subreddits, and YouTube channels.

    Args:
        feed_id: The ID of the feed to fetch icon for

    Returns:
        True if icon was fetched successfully, False otherwise
    """
    try:
        feed = Feed.objects.get(id=feed_id)

        # Skip if feed already has an icon
        if feed.icon:
            logger.debug(f"Feed {feed.name} already has an icon")
            return True

        # Use IconService to fetch icon
        icon_service = IconService()
        icon_url = icon_service.fetch_feed_icon(feed)

        if icon_url:
            # Use update to avoid triggering save() again
            Feed.objects.filter(pk=feed_id).update(icon=icon_url)
            logger.info(f"Set icon for feed '{feed.name}': {icon_url}")
            return True
        else:
            logger.warning(f"Could not fetch icon for feed '{feed.name}'")
            return False

    except Feed.DoesNotExist:
        logger.error(f"Feed with ID {feed_id} not found")
        return False
    except Exception as e:
        logger.error(f"Error fetching icon for feed {feed_id}: {e}")
        return False


# Default number of parallel workers for aggregation
DEFAULT_AGGREGATION_WORKERS = 4


def aggregate_all_feeds() -> dict:
    """
    Aggregate all enabled feeds in parallel.

    This task is scheduled to run periodically via Django-Q2.
    Uses ThreadPoolExecutor to aggregate multiple feeds concurrently.
    Only aggregates feeds where enabled=True.

    Returns:
        Dictionary with aggregation results
    """
    aggregation_service = AggregationService()
    return aggregation_service.aggregate_all_feeds()


def aggregate_single_feed(feed_id: int, force_refresh: bool = False) -> int:
    """
    Aggregate a single feed by ID.

    Args:
        feed_id: The ID of the feed to aggregate
        force_refresh: If True, re-download existing articles

    Returns:
        Number of new articles added
    """
    try:
        feed = Feed.objects.get(id=feed_id)
    except Feed.DoesNotExist:
        logger.error(f"Feed with ID {feed_id} not found")
        return 0

    try:
        aggregation_service = AggregationService()
        options_dict = feed.get_aggregator_options()
        new_count = aggregation_service.aggregate_feed(
            feed, force_refresh, options_dict
        )
        logger.info(f"Feed {feed.name}: {new_count} new articles")
        return new_count
    except Exception as e:
        logger.error(f"Error aggregating feed {feed.name}: {str(e)}")
        return 0


def delete_old_articles(months: int = 2) -> dict:
    """
    Delete articles older than the specified number of months.

    This task is scheduled to run daily to clean up old content.

    Args:
        months: Number of months after which content is considered old (default: 2)

    Returns:
        Dictionary with deletion results
    """
    results = {
        "articles_deleted": 0,
        "article_states_deleted": 0,
        "errors": [],
    }

    cutoff_date = timezone.now() - timedelta(days=months * 30)
    logger.info(f"Deleting content older than {cutoff_date.date()}")

    # Delete old articles and their user states
    # Use direct queryset operations without loading IDs into memory
    try:
        # Delete user states for old articles using subquery
        states_deleted, _ = UserArticleState.objects.filter(
            article__date__lt=cutoff_date
        ).delete()
        results["article_states_deleted"] = states_deleted

        # Delete the articles directly
        deleted, _ = Article.objects.filter(date__lt=cutoff_date).delete()
        results["articles_deleted"] = deleted

        if deleted > 0 or states_deleted > 0:
            logger.info(
                f"Deleted {deleted} old articles and {states_deleted} user states"
            )

    except Exception as e:
        error_msg = f"Error deleting old articles: {str(e)}"
        logger.error(error_msg)
        results["errors"].append(error_msg)

    logger.info(f"Cleanup complete: {results['articles_deleted']} total items deleted")

    return results


def reload_single_article(article_id: int) -> bool:
    """
    Refetch a single article by re-fetching and extracting its content.

    Args:
        article_id: The ID of the article to refetch

    Returns:
        True if refetch was successful, False otherwise
    """
    try:
        article = Article.objects.select_related("feed").get(id=article_id)
    except Article.DoesNotExist:
        logger.error(f"Article with ID {article_id} not found")
        return False

    try:
        aggregation_service = AggregationService()
        success = aggregation_service.reload_article(article)
        if success:
            logger.info(f"Successfully refetched article: {article.name}")
        return success
    except Exception as e:
        logger.error(
            f"Error refetching article {article.name}: {str(e)}", exc_info=True
        )
        return False


def clean_django_q_history(days: int = 7) -> dict:
    """
    Delete Django-Q2 task history older than the specified number of days.

    This task is scheduled to run daily to clean up old task results.
    Keeps only the last week of task history by default.

    Args:
        days: Number of days to keep (default: 7)

    Returns:
        Dictionary with deletion results
    """
    results = {
        "success_tasks_deleted": 0,
        "failed_tasks_deleted": 0,
        "errors": [],
    }

    cutoff_date = timezone.now() - timedelta(days=days)
    logger.info(f"Deleting Django-Q task history older than {cutoff_date.date()}")

    # Delete old successful task records
    try:
        deleted, _ = Success.objects.filter(stopped__lt=cutoff_date).delete()
        results["success_tasks_deleted"] = deleted

        if deleted > 0:
            logger.info(f"Deleted {deleted} old successful task records")

    except Exception as e:
        error_msg = f"Error deleting old successful tasks: {str(e)}"
        logger.error(error_msg)
        results["errors"].append(error_msg)

    # Delete old failed task records
    try:
        deleted, _ = Failure.objects.filter(stopped__lt=cutoff_date).delete()
        results["failed_tasks_deleted"] = deleted

        if deleted > 0:
            logger.info(f"Deleted {deleted} old failed task records")

    except Exception as e:
        error_msg = f"Error deleting old failed tasks: {str(e)}"
        logger.error(error_msg)
        results["errors"].append(error_msg)

    total_deleted = results["success_tasks_deleted"] + results["failed_tasks_deleted"]
    logger.info(
        f"Django-Q cleanup complete: {total_deleted} total task records deleted"
    )

    return results
