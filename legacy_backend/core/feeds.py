"""
RSS feed syndication classes for Yana.
"""

import logging
from typing import Any

from django.contrib.syndication.views import Feed as DjangoFeed
from django.db.models import QuerySet
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils.feedgenerator import Rss201rev2Feed

from core.services.feed_rss_service import FeedRssService

from .models import Article, Feed

logger = logging.getLogger(__name__)


class ArticleFeed(DjangoFeed):
    """
    RSS feed generator for Feed articles.

    Accessible via /feeds/<feed_id>/rss.xml

    Supports authentication via:
    - Django session (for web browsers)
    - HTTP Basic Auth (for RSS readers)
      Format: https://username:password@example.com/feeds/<feed_id>/rss.xml
    """

    feed_type = Rss201rev2Feed

    def __init__(self, **kwargs):
        """Initialize the feed with RSS service."""
        super().__init__(**kwargs)
        self.rss_service = FeedRssService()

    def __call__(self, request, *args, **kwargs):
        """
        Override __call__ to handle HTTP Basic Authentication.

        If user is not authenticated via session, try Basic Auth.
        If authentication fails, return 401 with WWW-Authenticate header.
        """
        # Try session authentication first
        if not request.user.is_authenticated:
            # Try HTTP Basic Auth
            user = self.rss_service.authenticate_feed_request(request)
            if user:
                # Set the authenticated user on the request
                request.user = user
            else:
                # Return 401 Unauthorized with WWW-Authenticate header
                response = HttpResponse(
                    "Authentication required", status=401, content_type="text/plain"
                )
                response["WWW-Authenticate"] = 'Basic realm="Yana RSS Feeds"'
                logger.warning(
                    f"Unauthenticated RSS feed access attempt from {request.META.get('REMOTE_ADDR')}"
                )
                return response

        # Proceed with normal feed generation
        return super().__call__(request, *args, **kwargs)

    def get_object(self, request, feed_id, **kwargs) -> Feed:
        """
        Get the Feed object based on the feed_id from the URL.

        Args:
            **kwargs:
            request: The HTTP request object
            feed_id: The ID of the feed to retrieve

        Returns:
            The Feed object

        Raises:
            Http404: If the feed does not exist or has an invalid aggregator
            PermissionDenied: If the user doesn't have access to this feed
        """
        logger.info(f"Generating RSS feed for feed_id={feed_id}")
        feed = get_object_or_404(Feed, pk=feed_id)

        # Check if user has access to this feed
        self.rss_service.check_feed_access(feed, request.user)

        return feed

    def title(self, obj: Feed) -> str:
        """Return the feed title."""
        return self.rss_service.get_feed_title(obj)

    def link(self, obj: Feed) -> str:
        """Return the link to the original feed."""
        return self.rss_service.get_feed_link(obj)

    def description(self, obj: Feed) -> str:
        """Return the feed description."""
        return self.rss_service.get_feed_description(obj)

    def items(self, obj: Feed) -> QuerySet[Article, Article]:
        """Return the articles for this feed."""
        return self.rss_service.get_feed_articles(obj)

    def item_title(self, item: Article) -> str:
        """
        Return the article title.

        Args:
            item: The Article object

        Returns:
            The article title
        """
        return item.name

    def item_description(self, item: Article) -> str:
        """
        Return the article content.

        Args:
            item: The Article object

        Returns:
            The article HTML content
        """
        return item.content

    def item_link(self, item: Article) -> str:
        """
        Return the link to the original article.

        Args:
            item: The Article object

        Returns:
            The article URL
        """
        return item.url

    def item_pubdate(self, item: Article) -> Any:
        """
        Return the article publication date.

        Args:
            item: The Article object

        Returns:
            The article publication date
        """
        return item.date

    def item_updateddate(self, item: Article) -> Any:
        """
        Return the article last updated date.

        Args:
            item: The Article object

        Returns:
            The article last updated date
        """
        return item.updated_at
