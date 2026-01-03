"""RSS feed parsing utilities."""

from typing import Any, Dict
from urllib.parse import urlparse

import feedparser


def parse_rss_feed(url: str) -> Dict[str, Any]:
    """
    Parse RSS/Atom feed from URL.

    Args:
        url: RSS feed URL

    Returns:
        Parsed feed dictionary with 'entries' list

    Raises:
        ValueError: If feed cannot be parsed or URL is invalid
    """
    # Validate URL
    parsed_url = urlparse(url)
    if not all([parsed_url.scheme, parsed_url.netloc]):
        raise ValueError(f"Invalid feed URL: {url}")

    # Parse feed
    feed = feedparser.parse(url)

    # Check for errors
    if hasattr(feed, "bozo") and feed.bozo and hasattr(feed, "bozo_exception"):
        raise ValueError(f"Feed parsing error: {feed.bozo_exception}")

    if not feed.entries:
        raise ValueError(f"No entries found in feed: {url}")

    return {"feed": feed.feed, "entries": feed.entries, "version": feed.version}
