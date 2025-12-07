"""
Service for fetching feed icons and favicons.
"""

import logging
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from core.services.base import BaseService

logger = logging.getLogger(__name__)


class IconService(BaseService):
    """
    Service for fetching icons and favicons for feeds.

    Handles different feed types: RSS feeds, Reddit subreddits, YouTube channels.
    """

    def fetch_favicon(self, url: str) -> str | None:
        """
        Fetch the favicon URL from a website.

        Tries multiple strategies:
        1. Parse the HTML for <link rel="icon"> tags
        2. Fall back to /favicon.ico

        Args:
            url: The website URL (can be RSS feed URL or base URL)

        Returns:
            The favicon URL if found, None otherwise
        """
        try:
            # Extract base URL from the feed URL
            parsed = urlparse(url)
            base_url = f"{parsed.scheme}://{parsed.netloc}"

            self.logger.info(f"Fetching favicon for {base_url}")

            # Set a reasonable timeout and headers
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }

            # Try to fetch the homepage and look for favicon in HTML
            try:
                response = requests.get(base_url, headers=headers, timeout=10)
                response.raise_for_status()

                soup = BeautifulSoup(response.text, "html.parser")

                # Look for various favicon link tags
                icon_selectors = [
                    ("link", {"rel": "icon"}),
                    ("link", {"rel": "shortcut icon"}),
                    ("link", {"rel": "apple-touch-icon"}),
                    ("link", {"rel": "apple-touch-icon-precomposed"}),
                ]

                for tag, attrs in icon_selectors:
                    icon_link = soup.find(tag, attrs)
                    if icon_link and icon_link.get("href"):
                        favicon_url = icon_link["href"]
                        # Handle relative URLs
                        if not favicon_url.startswith(("http://", "https://")):
                            favicon_url = urljoin(base_url, favicon_url)
                        self.logger.info(f"Found favicon in HTML: {favicon_url}")
                        return favicon_url

            except requests.RequestException as e:
                self.logger.debug(f"Could not fetch homepage for favicon: {e}")

            # Fall back to checking /favicon.ico
            favicon_ico_url = f"{base_url}/favicon.ico"
            try:
                response = requests.head(favicon_ico_url, headers=headers, timeout=5)
                if response.status_code == 200:
                    self.logger.info(f"Found favicon.ico: {favicon_ico_url}")
                    return favicon_ico_url
            except requests.RequestException as e:
                self.logger.debug(f"Could not fetch favicon.ico: {e}")

            self.logger.warning(f"No favicon found for {base_url}")
            return None

        except Exception as e:
            self.logger.error(f"Error fetching favicon for {url}: {e}", exc_info=True)
            return None

    def fetch_reddit_icon(self, identifier: str) -> str | None:
        """
        Fetch the icon URL for a Reddit subreddit.

        Args:
            identifier: Subreddit identifier (e.g., "python", "r/programming")

        Returns:
            The subreddit icon URL if found, None otherwise
        """
        try:
            from aggregators.reddit import normalize_subreddit

            # Normalize subreddit name
            subreddit_name = normalize_subreddit(identifier)
            if not subreddit_name:
                self.logger.warning(
                    f"Could not normalize Reddit identifier: {identifier}"
                )
                return None

            self.logger.info(f"Fetching Reddit icon for r/{subreddit_name}")

            # Try to get Reddit client and fetch subreddit icon
            try:
                from aggregators.reddit import RedditAggregator

                aggregator = RedditAggregator()
                reddit = aggregator.get_reddit_client()
                subreddit = reddit.subreddit(subreddit_name)

                # Get icon URL from subreddit
                icon_url = subreddit.icon_img
                if icon_url and icon_url not in ("", "self", "default"):
                    self.logger.info(
                        f"Found Reddit icon for r/{subreddit_name}: {icon_url}"
                    )
                    return icon_url

                # Fallback to community icon
                community_icon = subreddit.community_icon
                if community_icon and community_icon not in ("", "self", "default"):
                    self.logger.info(
                        f"Found Reddit community icon for r/{subreddit_name}: {community_icon}"
                    )
                    return community_icon

                self.logger.debug(
                    f"No icon found for r/{subreddit_name}, using default"
                )
                return "https://www.reddit.com/favicon.ico"

            except ValueError as e:
                # Reddit API credentials not configured
                self.logger.debug(f"Reddit API not configured, using default icon: {e}")
                return "https://www.reddit.com/favicon.ico"
            except Exception as e:
                self.logger.warning(
                    f"Error fetching Reddit icon for r/{subreddit_name}: {e}"
                )
                return "https://www.reddit.com/favicon.ico"

        except Exception as e:
            self.logger.error(
                f"Error fetching Reddit icon for {identifier}: {e}", exc_info=True
            )
            return "https://www.reddit.com/favicon.ico"

    def fetch_youtube_icon(self, identifier: str) -> str | None:
        """
        Fetch the icon URL for a YouTube channel.

        Args:
            identifier: YouTube channel identifier (e.g., "@mkbhd", "UC...")

        Returns:
            The channel icon URL if found, None otherwise
        """
        try:
            from aggregators.youtube import resolve_channel_id

            self.logger.info(f"Fetching YouTube icon for {identifier}")

            # Resolve to channel ID
            channel_id, error = resolve_channel_id(identifier)
            if error:
                self.logger.warning(
                    f"Could not resolve YouTube identifier '{identifier}': {error}"
                )
                return "https://www.youtube.com/s/desktop/favicon.ico"

            # Get channel icon from YouTube API
            try:
                from aggregators.youtube import get_youtube_client

                youtube = get_youtube_client()
                request = youtube.channels().list(part="snippet", id=channel_id)
                response = request.execute()

                items = response.get("items", [])
                if items:
                    snippet = items[0].get("snippet", {})
                    thumbnails = snippet.get("thumbnails", {})
                    # Get highest quality thumbnail (prefer high quality first)
                    for quality in ["high", "medium", "default"]:
                        if quality in thumbnails:
                            icon_url = thumbnails[quality]["url"]
                            self.logger.info(
                                f"Found YouTube icon for channel {channel_id}: {icon_url}"
                            )
                            return icon_url

                self.logger.debug(
                    f"No icon found for YouTube channel {channel_id}, using default"
                )
                return "https://www.youtube.com/s/desktop/favicon.ico"

            except ValueError as e:
                # YouTube API key not configured
                self.logger.debug(
                    f"YouTube API not configured, using default icon: {e}"
                )
                return "https://www.youtube.com/s/desktop/favicon.ico"
            except Exception as e:
                self.logger.warning(
                    f"Error fetching YouTube icon for {identifier}: {e}"
                )
                return "https://www.youtube.com/s/desktop/favicon.ico"

        except Exception as e:
            self.logger.error(
                f"Error fetching YouTube icon for {identifier}: {e}", exc_info=True
            )
            return "https://www.youtube.com/s/desktop/favicon.ico"

    def fetch_feed_icon(self, feed) -> str | None:
        """
        Fetch icon for a feed based on its type.

        Args:
            feed: Feed object

        Returns:
            Icon URL or None
        """
        if feed.feed_type == "reddit":
            return self.fetch_reddit_icon(feed.identifier)
        elif feed.feed_type == "youtube":
            return self.fetch_youtube_icon(feed.identifier)
        elif feed.identifier and feed.identifier.startswith(("http://", "https://")):
            return self.fetch_favicon(feed.identifier)
        return None
