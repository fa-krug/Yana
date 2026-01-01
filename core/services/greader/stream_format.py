"""Google Reader API stream formatting utilities.

Handles formatting of articles and feeds for Google Reader API responses,
including ID encoding/decoding and response structure building.
"""

import logging
from datetime import datetime
from typing import Any, Optional
from urllib.parse import urlparse

from core.models import Article, Feed

logger = logging.getLogger(__name__)


def to_hex_id(article_id: int) -> str:
    """Convert integer article ID to 16-character hexadecimal format.

    Google Reader API uses 16-char hex IDs for articles.
    Examples: 123 -> '000000000000007b', 456 -> '00000000000001c8'

    Args:
        article_id: Integer article ID

    Returns:
        16-character hexadecimal string (zero-padded)
    """
    return f"{article_id:016x}"


def from_hex_id(hex_str: str) -> int:
    """Convert 16-character hexadecimal string to integer ID.

    Args:
        hex_str: 16-character hex string

    Returns:
        Integer article ID

    Raises:
        ValueError: If string is not valid hex
    """
    return int(hex_str, 16)


def parse_item_id(item_id: str) -> int:
    """Parse Google Reader item ID to integer article ID.

    Handles multiple ID formats:
    - Full format: 'tag:google.com,2005:reader/item/000000000000007b'
    - Hex format: '000000000000007b'
    - Integer format: '123' or '0x7b'

    Args:
        item_id: Item ID in any supported format

    Returns:
        Integer article ID

    Raises:
        ValueError: If ID format is not recognized
    """
    item_id = item_id.strip()

    # Handle full Google Reader format
    if item_id.startswith("tag:google.com,2005:reader/item/"):
        hex_part = item_id.replace("tag:google.com,2005:reader/item/", "")
        return from_hex_id(hex_part)

    # Handle hex format (16 chars)
    if len(item_id) == 16 and all(c in "0123456789abcdefABCDEF" for c in item_id):
        return from_hex_id(item_id)

    # Handle hex format with 0x prefix
    if item_id.startswith("0x"):
        return int(item_id, 16)

    # Handle plain integer
    try:
        return int(item_id)
    except ValueError as e:
        raise ValueError(f"Invalid item ID format: {item_id}") from e


def encode_item_id(article_id: int) -> str:
    """Encode article ID to full Google Reader format.

    Args:
        article_id: Integer article ID

    Returns:
        Full Google Reader item ID: 'tag:google.com,2005:reader/item/...'
    """
    hex_id = to_hex_id(article_id)
    return f"tag:google.com,2005:reader/item/{hex_id}"


def unix_timestamp(dt: Optional[datetime]) -> int:
    """Convert datetime to Unix timestamp (seconds).

    Args:
        dt: datetime object or None

    Returns:
        Unix timestamp in seconds
    """
    if dt is None:
        dt = datetime.now()
    return int(dt.timestamp())


def unix_timestamp_microseconds(dt: Optional[datetime]) -> str:
    """Convert datetime to Unix timestamp in microseconds as string.

    Google Reader API expects timestamps in microseconds for ordering.

    Args:
        dt: datetime object or None

    Returns:
        Timestamp in microseconds as string
    """
    if dt is None:
        dt = datetime.now()
    microseconds = int(dt.timestamp() * 1000000)
    return str(microseconds)


def get_feed_source_url(feed: Feed) -> str:
    """Get the source URL for a feed using its aggregator.

    Instantiates the aggregator and calls its get_source_url() method,
    which may provide a hardcoded URL or derive it from the identifier.

    Args:
        feed: Feed model instance

    Returns:
        Source URL string, or empty string if not available
    """
    try:
        from core.aggregators.registry import get_aggregator

        aggregator = get_aggregator(feed)
        return aggregator.get_source_url()
    except Exception:
        # Fallback to manual mapping if aggregator fails
        return get_site_url(feed)


def get_site_url(feed: Feed) -> str:
    """Get the website URL for a feed based on aggregator type.

    This is a fallback method used when the aggregator's get_source_url()
    is not available. Prefer get_feed_source_url() for new code.

    Args:
        feed: Feed model instance

    Returns:
        URL string pointing to the feed's website
    """
    aggregator = feed.aggregator
    identifier = feed.identifier or ""

    # Handle special aggregators
    if aggregator == "reddit":
        # Reddit subreddit
        subreddit = identifier.lstrip("r/").rstrip("/")
        return f"https://reddit.com/r/{subreddit}"

    if aggregator == "youtube":
        # YouTube channel or handle
        if identifier.startswith("UC"):  # Channel ID format
            return f"https://youtube.com/channel/{identifier}"
        elif identifier.startswith("@"):  # Handle format
            return f"https://youtube.com/{identifier}"
        else:
            return f"https://youtube.com/{identifier}"

    if aggregator == "podcast":
        # Podcast URL if identifier is a URL
        if identifier.startswith(("http://", "https://")):
            return identifier
        return ""

    # For generic websites, try to extract domain from identifier
    if identifier.startswith(("http://", "https://")):
        parsed = urlparse(identifier)
        return f"{parsed.scheme}://{parsed.netloc}"

    # Fallback
    return ""


def format_subscription(feed: Feed, request, groups: list[dict] = None) -> dict[str, Any]:
    """Format a Feed as Google Reader subscription object.

    Args:
        feed: Feed model instance
        request: Django request object (unused, kept for API compatibility)
        groups: List of group dicts with 'id' and 'label' keys

    Returns:
        Dictionary in Google Reader subscription format
    """
    if groups is None:
        groups = []

    source_url = get_feed_source_url(feed)

    return {
        "id": f"feed/{feed.id}",
        "title": feed.name,
        "categories": groups,
        "url": source_url,
        "htmlUrl": source_url,
    }


def format_stream_item(
    article: Article,
    feed: Feed,
    request,
    is_read: bool = False,
    is_starred: bool = False,
) -> dict[str, Any]:
    """Format an Article as Google Reader stream item object.

    Args:
        article: Article model instance
        feed: Associated Feed model instance
        request: Django request object for building absolute URIs
        is_read: Whether article is marked as read
        is_starred: Whether article is marked as starred

    Returns:
        Dictionary in Google Reader stream item format
    """
    # Build categories (states)
    categories = ["user/-/state/com.google/reading-list"]

    if is_read:
        categories.append("user/-/state/com.google/read")

    if is_starred:
        categories.append("user/-/state/com.google/starred")

    # Get timestamps
    published_timestamp = unix_timestamp(article.date)
    updated_timestamp = unix_timestamp(article.updated_at)
    timestamp_usec = unix_timestamp_microseconds(article.date)
    crawl_time_msec = str(int(article.date.timestamp() * 1000))

    # Build item object
    item = {
        "id": encode_item_id(article.id),
        "title": article.name,
        "published": published_timestamp,
        "updated": updated_timestamp,
        "crawlTimeMsec": crawl_time_msec,
        "timestampUsec": timestamp_usec,
        "categories": categories,
    }

    # Add alternate link
    if article.identifier:
        item["alternate"] = [{"href": article.identifier}]

    # Add canonical link (same as alternate for most feeds)
    if article.identifier:
        item["canonical"] = [{"href": article.identifier}]

    # Add origin (feed info)
    item["origin"] = {
        "streamId": f"feed/{feed.id}",
        "title": feed.name,
        "htmlUrl": get_site_url(feed),
    }

    # Add summary (content)
    if article.content:
        item["summary"] = {
            "direction": "ltr",
            "content": article.content,
        }
        item["content"] = {
            "direction": "ltr",
            "content": article.content,
        }

    # Add author if available
    if article.author:
        item["author"] = article.author

    # Add icon if available
    if article.icon:
        item["image"] = request.build_absolute_uri(article.icon.url)

    return item


def format_subscription_list(subscriptions: list[dict]) -> dict[str, Any]:
    """Format list of subscriptions as Google Reader response.

    Args:
        subscriptions: List of subscription dicts from format_subscription

    Returns:
        Dictionary in Google Reader subscription/list format
    """
    return {
        "subscriptions": subscriptions,
    }


def format_tag_list(tags: list[dict[str, str]]) -> dict[str, Any]:
    """Format list of tags as Google Reader response.

    Args:
        tags: List of tag dicts with id field

    Returns:
        Dictionary in Google Reader tag/list format
    """
    return {
        "tags": tags,
    }


def format_stream_contents(
    items: list[dict],
    stream_id: str = "user/-/state/com.google/reading-list",
    continuation: str = None,
) -> dict[str, Any]:
    """Format stream contents as Google Reader response.

    Args:
        items: List of items from format_stream_item
        stream_id: The stream ID being displayed
        continuation: Optional continuation token for pagination

    Returns:
        Dictionary in Google Reader stream/contents format
    """
    result = {
        "direction": "ltr",
        "id": stream_id,
        "title": stream_id,
        "self": [{"href": f"http://www.google.com/reader/api/0/stream/contents/{stream_id}"}],
        "links": [{"href": "http://www.google.com/reader/", "rel": "alternate"}],
        "updated": unix_timestamp(None),
        "items": items,
    }

    if continuation:
        result["continuation"] = continuation

    return result


def format_unread_count_list(counts: list[dict]) -> dict[str, Any]:
    """Format unread counts as Google Reader response.

    Args:
        counts: List of dicts with 'id', 'count', 'newestItemTimestampUsec'

    Returns:
        Dictionary in Google Reader unread/count format
    """
    return {
        "max": 150,
        "unreadcounts": counts,
    }


def format_item_id_list(item_ids: list[int]) -> dict[str, Any]:
    """Format item IDs as Google Reader response.

    Args:
        item_ids: List of integer article IDs

    Returns:
        Dictionary in Google Reader stream/items/ids format
    """
    return {
        "itemRefs": [{"id": str(item_id)} for item_id in item_ids],
    }


def format_error_response(message: str) -> str:
    """Format error message for Google Reader API.

    Args:
        message: Error message text

    Returns:
        Formatted error response
    """
    return message


def format_text_response(message: str) -> str:
    """Format text response for Google Reader API.

    For endpoints that return plain text (ClientLogin, token, etc).

    Args:
        message: Response message/content

    Returns:
        Plain text response
    """
    return message
