"""
Service for RSS feed generation and authentication.
"""

import base64
import binascii
import logging

from django.contrib.auth import authenticate
from django.core.exceptions import PermissionDenied
from django.http import HttpRequest

from core.models import Feed
from core.services.base import BaseService
from core.services.user_access_service import UserAccessService

logger = logging.getLogger(__name__)


class FeedRssService(BaseService):
    """
    Service for generating RSS feeds and handling feed authentication.

    Supports both Django session authentication and HTTP Basic Auth.
    """

    def __init__(self):
        """Initialize the service."""
        super().__init__()
        self.user_access_service = UserAccessService()

    def authenticate_feed_request(self, request: HttpRequest):
        """
        Authenticate a feed request using session or Basic Auth.

        Args:
            request: HTTP request object

        Returns:
            User object if authenticated, None otherwise
        """
        # Try session authentication first
        if request.user.is_authenticated:
            return request.user

        # Try HTTP Basic Auth
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")

        if not auth_header.startswith("Basic "):
            return None

        try:
            # Decode base64 credentials
            auth_decoded = base64.b64decode(auth_header[6:]).decode("utf-8")
            username, password = auth_decoded.split(":", 1)

            # Authenticate user
            user = authenticate(username=username, password=password)
            if user and user.is_active:
                self.logger.info(f"RSS feed authenticated via Basic Auth: {username}")
                return user

        except (ValueError, binascii.Error, UnicodeDecodeError) as e:
            self.logger.warning(f"Invalid Basic Auth header: {e}")

        return None

    def check_feed_access(self, feed: Feed, user) -> None:
        """
        Check if user has access to feed, raising exception if not.

        Args:
            feed: Feed object
            user: User object

        Raises:
            PermissionDenied: If user cannot access feed
        """
        if not self.user_access_service.can_access_feed(feed, user):
            raise PermissionDenied("You don't have permission to access this feed")

    def get_feed_articles(self, feed: Feed, limit: int = 50):
        """
        Get articles for RSS feed generation.

        Args:
            feed: Feed object
            limit: Maximum number of articles to return

        Returns:
            List of Article objects ordered by date (newest first)
        """
        # Use list() to evaluate once, avoiding extra count() query
        articles = list(feed.articles.all()[:limit])
        self.logger.info(f"Returning {len(articles)} articles for feed '{feed.name}'")
        return articles

    def get_feed_title(self, feed: Feed) -> str:
        """
        Get feed title for RSS generation.

        Args:
            feed: Feed object

        Returns:
            Feed title
        """
        return feed.name

    def get_feed_link(self, feed: Feed) -> str:
        """
        Get feed link for RSS generation.

        Args:
            feed: Feed object

        Returns:
            Feed identifier (URL for RSS feeds)
        """
        return feed.identifier

    def get_feed_description(self, feed: Feed) -> str:
        """
        Get feed description for RSS generation.

        Args:
            feed: Feed object

        Returns:
            Feed description
        """
        return f"Aggregated feed for {feed.name}"
