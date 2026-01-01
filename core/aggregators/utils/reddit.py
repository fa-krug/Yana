"""
Reddit utilities for header element extraction.

Provides functions for:
- Detecting Reddit embed URLs
- Extracting post info (subreddit, post ID)
- Generating Reddit embed HTML
- Fetching subreddit icons
"""

import re
from typing import Optional, Dict, Any
import requests
import logging

logger = logging.getLogger(__name__)

# Reddit API endpoint
REDDIT_API_BASE = "https://www.reddit.com"


def is_reddit_embed_url(url: str) -> bool:
    """
    Check if URL is a Reddit video embed URL.

    Handles:
    - vxreddit.com URLs (Reddit video mirror)
    - reddit.com/embed URLs
    - v.redd.it/embed URLs

    Args:
        url: URL to check

    Returns:
        True if URL is a Reddit embed URL
    """
    if not url:
        return False

    return (
        "vxreddit.com" in url
        or ("/embed" in url and ("reddit.com" in url or "v.redd.it" in url))
    )


def extract_post_info_from_url(url: str) -> Dict[str, Optional[str]]:
    """
    Extract subreddit and post ID from Reddit post URL.

    Pattern: /r/{SUBREDDIT}/comments/{POST_ID}/...

    Args:
        url: Reddit post URL

    Returns:
        Dict with keys 'subreddit' and 'post_id' (both Optional[str])
    """
    result = {"subreddit": None, "post_id": None}

    if not url:
        return result

    # Pattern: /r/subreddit/comments/post_id/
    match = re.search(r"/r/(\w+)/comments/([a-zA-Z0-9]+)", url)
    if match:
        result["subreddit"] = match.group(1)
        result["post_id"] = match.group(2)

    return result


def create_reddit_embed_html(embed_url: str, caption: str = "") -> str:
    """
    Create HTML for embedded Reddit video.

    Generates an iframe with responsive styling for Reddit embeds.

    Args:
        embed_url: Reddit embed URL (vxreddit.com or reddit.com/embed)
        caption: Optional caption to append after iframe

    Returns:
        HTML string with reddit-embed-container div and iframe
    """
    html = (
        f'<div class="reddit-embed-container">'
        f'<style>'
        f".reddit-embed-container iframe {{ "
        f"width: 100%; "
        f"height: calc((100% / 16) * 9); "
        f"aspect-ratio: 16 / 9; "
        f"}}"
        f"@media (max-width: 512px) {{ "
        f".reddit-embed-container iframe {{ "
        f"height: calc((100vw / 16) * 9); "
        f"}}"
        f"}}"
        f"</style>"
        f'<iframe src="{embed_url}" '
        f'title="Reddit video player" '
        f'frameborder="0" '
        f'scrolling="no" '
        f'allowfullscreen></iframe>'
    )

    if caption:
        html += caption

    html += "</div>"

    return html


def fetch_subreddit_icon(subreddit: str, timeout: int = 10) -> Optional[str]:
    """
    Fetch subreddit icon URL from Reddit API.

    Uses the public subreddit about JSON endpoint to get community icon.

    Args:
        subreddit: Subreddit name (without /r/)
        timeout: Request timeout in seconds

    Returns:
        Subreddit icon URL if found, None otherwise
    """
    if not subreddit:
        return None

    try:
        url = f"{REDDIT_API_BASE}/r/{subreddit}/about.json"
        headers = {"User-Agent": "Yana/1.0"}

        response = requests.get(url, headers=headers, timeout=timeout)
        response.raise_for_status()

        data = response.json()
        subreddit_data = data.get("data", {})

        # Try icon_img first (older field)
        icon_url = subreddit_data.get("icon_img")
        if icon_url:
            # Fix Reddit media URL encoding (&amp; -> &)
            icon_url = fix_reddit_media_url(icon_url)
            logger.debug(f"Found subreddit icon for r/{subreddit}: {icon_url}")
            return icon_url

        # Fallback to community_icon (newer field)
        community_icon = subreddit_data.get("community_icon")
        if community_icon:
            community_icon = fix_reddit_media_url(community_icon)
            logger.debug(f"Found community icon for r/{subreddit}: {community_icon}")
            return community_icon

        logger.debug(f"No icon found for subreddit r/{subreddit}")
        return None

    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            logger.debug(f"Subreddit r/{subreddit} not found")
        else:
            logger.warning(
                f"HTTP error fetching subreddit r/{subreddit}: {e.response.status_code}"
            )
    except requests.exceptions.RequestException as e:
        logger.warning(f"Error fetching subreddit icon for r/{subreddit}: {e}")
    except Exception as e:
        logger.error(f"Unexpected error fetching subreddit icon: {e}")

    return None


def fix_reddit_media_url(url: str) -> str:
    """
    Fix Reddit media URL encoding.

    Reddit sometimes encodes '&' as '&amp;' in URLs.
    This function fixes those URLs so they work correctly.

    Args:
        url: URL from Reddit API

    Returns:
        Fixed URL
    """
    if not url:
        return url

    return url.replace("&amp;", "&")


def is_reddit_url(url: str) -> bool:
    """
    Check if a URL is a Reddit URL.

    Args:
        url: URL to check

    Returns:
        True if URL is from reddit.com or similar
    """
    if not url:
        return False

    return any(domain in url for domain in ["reddit.com", "v.redd.it", "vxreddit.com"])
