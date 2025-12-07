"""
Service for discovering feed URLs from website URLs.
"""

import logging
from urllib.parse import urlparse

import feedparser
import requests
from bs4 import BeautifulSoup

from core.services.base import BaseService, ValidationError

logger = logging.getLogger(__name__)


class FeedDiscoveryService(BaseService):
    """
    Service for discovering feed URLs and metadata from website URLs.

    Handles feed discovery from HTML pages and validates feed URLs.
    """

    def discover_feed(self, url: str) -> tuple[str | None, str | None]:
        """
        Discover the feed URL and title from a given URL.

        Tries multiple strategies:
        1. If URL is already a valid feed, use it directly
        2. Look for <link rel="alternate"> tags in HTML
        3. Try common feed paths like /feed, /rss, /atom.xml

        Args:
            url: The URL to discover feed from

        Returns:
            Tuple of (feed_url, feed_title) or (None, None) if not found

        Raises:
            ValidationError: If URL is invalid
        """
        if not url:
            raise ValidationError("URL cannot be empty")

        # Normalize URL
        if not url.startswith(("http://", "https://")):
            url = f"https://{url}"

        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; Yana/1.0; +https://github.com/yana)"
        }

        try:
            # First, try to fetch the URL and check if it's already a feed
            response = requests.get(url, headers=headers, timeout=15)
            response.raise_for_status()
            content_type = response.headers.get("Content-Type", "").lower()

            # Check if this is already a feed
            if any(
                ct in content_type for ct in ["xml", "rss", "atom", "application/feed"]
            ):
                parsed = feedparser.parse(response.text)
                if parsed.entries or parsed.feed.get("title"):
                    title = parsed.feed.get("title", "")
                    return url, title

            # Try parsing as feed anyway (some feeds have text/html content-type)
            parsed = feedparser.parse(response.text)
            if parsed.entries:
                title = parsed.feed.get("title", "")
                return url, title

            # If it's HTML, look for feed links
            if "html" in content_type:
                soup = BeautifulSoup(response.text, "html.parser")

                # Look for <link rel="alternate"> with feed types
                for link in soup.find_all("link", rel="alternate"):
                    link_type = link.get("type", "").lower()
                    if any(ft in link_type for ft in ["rss", "atom", "xml", "feed"]):
                        feed_href = link.get("href", "")
                        if feed_href:
                            # Handle relative URLs
                            if not feed_href.startswith(("http://", "https://")):
                                parsed_base = urlparse(url)
                                if feed_href.startswith("/"):
                                    feed_href = f"{parsed_base.scheme}://{parsed_base.netloc}{feed_href}"
                                else:
                                    feed_href = f"{url.rstrip('/')}/{feed_href}"

                            # Verify this is a valid feed
                            feed_title = link.get("title", "")
                            try:
                                feed_resp = requests.get(
                                    feed_href, headers=headers, timeout=10
                                )
                                parsed_feed = feedparser.parse(feed_resp.text)
                                if parsed_feed.entries or parsed_feed.feed.get("title"):
                                    return (
                                        feed_href,
                                        feed_title or parsed_feed.feed.get("title", ""),
                                    )
                            except Exception:
                                continue

                # Try common feed paths
                parsed_url = urlparse(url)
                base_url = f"{parsed_url.scheme}://{parsed_url.netloc}"
                common_paths = [
                    "/feed",
                    "/feed/",
                    "/rss",
                    "/rss/",
                    "/rss.xml",
                    "/atom.xml",
                    "/feed.xml",
                    "/index.xml",
                    "/feeds/posts/default",  # Blogger
                ]

                for path in common_paths:
                    try:
                        test_url = f"{base_url}{path}"
                        feed_resp = requests.get(test_url, headers=headers, timeout=5)
                        if feed_resp.status_code == 200:
                            parsed_feed = feedparser.parse(feed_resp.text)
                            if parsed_feed.entries:
                                return test_url, parsed_feed.feed.get("title", "")
                    except Exception:
                        continue

        except requests.RequestException as e:
            self.logger.warning(f"Error fetching URL {url}: {e}")

        return None, None

    def validate_feed_url(self, url: str) -> tuple[bool, str | None]:
        """
        Validate that a feed URL is accessible and contains valid feed data.

        Args:
            url: Feed URL to validate

        Returns:
            Tuple of (is_valid, error_message)
        """
        if not url:
            return False, "URL cannot be empty"

        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (compatible; Yana/1.0; +https://github.com/yana)"
            }
            response = requests.get(url, headers=headers, timeout=15)
            response.raise_for_status()

            parsed = feedparser.parse(response.text)
            if parsed.entries or parsed.feed.get("title"):
                return True, None
            return False, "Feed URL does not contain any entries"

        except requests.RequestException as e:
            return False, f"Could not fetch feed URL: {str(e)}"
        except Exception as e:
            return False, f"Error validating feed: {str(e)}"

    def extract_feed_metadata(self, feed_url: str) -> dict:
        """
        Extract feed metadata (title, description, etc.) from a feed URL.

        Args:
            feed_url: Feed URL to extract metadata from

        Returns:
            Dictionary with feed metadata (title, description, etc.)
        """
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (compatible; Yana/1.0; +https://github.com/yana)"
            }
            response = requests.get(feed_url, headers=headers, timeout=15)
            response.raise_for_status()

            parsed = feedparser.parse(response.text)
            feed_info = parsed.feed

            return {
                "title": feed_info.get("title", ""),
                "description": feed_info.get("description", ""),
                "link": feed_info.get("link", ""),
                "language": feed_info.get("language", ""),
            }

        except Exception as e:
            self.logger.warning(f"Error extracting feed metadata from {feed_url}: {e}")
            return {
                "title": "",
                "description": "",
                "link": "",
                "language": "",
            }
