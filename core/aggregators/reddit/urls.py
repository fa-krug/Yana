"""Reddit URL utilities."""

import logging
import re
from typing import Any, Dict, Optional

import requests

from .auth import get_reddit_access_token

logger = logging.getLogger(__name__)

REDDIT_API_BASE = "https://www.reddit.com"


def decode_html_entities_in_url(url: str) -> str:
    """
    Decode HTML entities in URLs.

    Converts &amp; to &, &lt; to <, &gt; to >, &quot; to ", &#39; to '.

    Args:
        url: URL string

    Returns:
        Decoded URL
    """
    return (
        url.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
    )


def fix_reddit_media_url(url: Optional[str]) -> Optional[str]:
    """
    Fix redditmedia.com and external-preview.redd.it URLs.

    Replaces &amp; with & and decodes HTML entities.

    Args:
        url: URL from Reddit API

    Returns:
        Fixed URL or None
    """
    if not url:
        return None

    decoded = decode_html_entities_in_url(url)
    if "styles.redditmedia.com" in decoded or "external-preview.redd.it" in decoded:
        return decoded.replace("&amp;", "&")
    return decoded


def normalize_subreddit(identifier: str) -> str:
    """
    Extract subreddit name from URL or identifier.

    Args:
        identifier: Subreddit identifier (can be URL, r/subreddit, or just subreddit)

    Returns:
        Normalized subreddit name
    """
    identifier = identifier.strip()

    # Extract from URL
    url_match = re.search(r"(?:reddit\.com)?/r/(\w+)", identifier)
    if url_match:
        return url_match.group(1)

    # Remove r/ or /r/ prefix
    if identifier.startswith("/r/"):
        return identifier[3:]
    if identifier.startswith("r/"):
        return identifier[2:]

    return identifier


def extract_post_info_from_url(url: str) -> Dict[str, Optional[str]]:
    """
    Extract post ID and subreddit from Reddit URL.

    Format: https://reddit.com/r/{subreddit}/comments/{postId}/...

    Args:
        url: Reddit post URL

    Returns:
        Dict with 'subreddit' and 'post_id' keys
    """
    match = re.search(r"/r/(\w+)/comments/([a-zA-Z0-9]+)", url)
    if match:
        return {"subreddit": match.group(1), "post_id": match.group(2)}
    return {"subreddit": None, "post_id": None}


def validate_subreddit(subreddit: str) -> Dict[str, Any]:
    """
    Validate subreddit name.

    Args:
        subreddit: Subreddit name

    Returns:
        Dict with 'valid' (bool) and optional 'error' (str)
    """
    if not subreddit:
        return {"valid": False, "error": "Subreddit is required"}

    # Subreddit names: 2-21 characters, alphanumeric and underscores only
    if not re.match(r"^\w{2,21}$", subreddit):
        return {
            "valid": False,
            "error": "Invalid subreddit name. Use 2-21 alphanumeric characters or underscores.",
        }

    return {"valid": True}


def fetch_subreddit_info(subreddit: str, user_id: int) -> Dict[str, Optional[str]]:
    """
    Fetch subreddit information including icon.

    Args:
        subreddit: Subreddit name (without /r/)
        user_id: User ID for authentication

    Returns:
        Dict with 'iconUrl' key
    """
    try:
        access_token = get_reddit_access_token(user_id)
        url = f"https://oauth.reddit.com/r/{subreddit}/about"
        response = requests.get(
            url,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        response.raise_for_status()

        data = response.json()
        subreddit_data = data.get("data", {})

        # Prefer icon_img, fall back to community_icon
        raw_icon_url = subreddit_data.get("icon_img") or subreddit_data.get("community_icon")
        icon_url = None
        if raw_icon_url:
            icon_url = fix_reddit_media_url(decode_html_entities_in_url(raw_icon_url))

        if icon_url:
            logger.debug(f"Fetched subreddit icon for r/{subreddit}: {icon_url}")

        return {"iconUrl": icon_url}

    except Exception as e:
        logger.warning(f"Failed to fetch subreddit info for r/{subreddit}: {e}")
        return {"iconUrl": None}


def extract_urls_from_text(text: str) -> list[str]:
    """
    Extract URLs from Reddit post text (selftext).

    Handles both plain URLs and markdown links [text](url).
    Decodes HTML entities in extracted URLs.

    Args:
        text: Text to extract URLs from

    Returns:
        List of URLs
    """
    if not text:
        return []

    urls = []

    # Pattern for markdown links: [text](url)
    markdown_link_pattern = re.compile(r"\[([^\]]*)\]\((https?://[^)]+)\)")
    for match in markdown_link_pattern.finditer(text):
        urls.append(decode_html_entities_in_url(match.group(2)))

    # Pattern for plain URLs: http:// or https://
    plain_url_pattern = re.compile(r"(?<!\]\()(https?://[^\s)]+)")
    for match in plain_url_pattern.finditer(text):
        # Remove trailing punctuation
        url = re.sub(r"[.,;:!?)]+$", "", match.group(1))
        decoded_url = decode_html_entities_in_url(url)
        if decoded_url not in urls:
            urls.append(decoded_url)

    return urls
