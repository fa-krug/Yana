"""
YouTube utilities for header element extraction.

Provides functions for:
- Detecting and extracting YouTube video IDs
- Generating YouTube embed HTML
- Constructing thumbnail URLs
"""

import re
from typing import Optional

from bs4 import BeautifulSoup
from django.conf import settings


def extract_youtube_video_id(url: str) -> Optional[str]:
    """
    Extract YouTube video ID from various URL formats.

    Handles:
    - youtu.be/{ID}
    - youtube.com/watch?v={ID}
    - youtube.com/embed/{ID}
    - youtube.com/v/{ID}
    - youtube.com/shorts/{ID}

    Args:
        url: YouTube URL in various formats

    Returns:
        Video ID if valid format found, None otherwise
    """
    if not url:
        return None

    patterns = [
        # youtu.be short URL
        r"youtu\.be/([A-Za-z0-9_-]+)",
        # youtube.com watch URL
        r"youtube\.com/watch\?.*v=([A-Za-z0-9_-]+)",
        # youtube.com embed URL
        r"youtube\.com/embed/([A-Za-z0-9_-]+)",
        # youtube.com /v/ URL
        r"youtube\.com/v/([A-Za-z0-9_-]+)",
        # youtube.com shorts
        r"youtube\.com/shorts/([A-Za-z0-9_-]+)",
    ]

    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            video_id = match.group(1)
            # Validate video ID format
            if re.match(r"^[A-Za-z0-9_-]{11}$", video_id) or re.match(
                r"^[A-Za-z0-9_-]+$", video_id
            ):
                return video_id

    return None


def get_youtube_thumbnail_url(video_id: str, quality: str = "maxresdefault") -> str:
    """
    Get YouTube thumbnail URL for a video.

    Quality options (in order of preference):
    - maxresdefault: Highest quality (1280x720)
    - hqdefault: High quality (480x360)
    - sddefault: Standard quality (640x480)
    - mqdefault: Medium quality (320x180)
    - default: Default (120x90)

    Args:
        video_id: YouTube video ID
        quality: Thumbnail quality level

    Returns:
        URL to thumbnail image
    """
    return f"https://img.youtube.com/vi/{video_id}/{quality}.jpg"


def get_youtube_proxy_url(video_id: str) -> str:
    """
    Get full YouTube proxy URL for a video.

    Args:
        video_id: YouTube video ID

    Returns:
        Full URL to the proxy endpoint
    """
    return f"{settings.BASE_URL}/api/youtube-proxy?v={video_id}"


def create_youtube_embed_html(video_id: str, caption: str = "") -> str:
    """
    Create HTML for embedded YouTube video.

    Generates an iframe element that uses a full proxy endpoint for embedding
    (to avoid embedding YouTube's standard iframe which may have
    privacy/tracking considerations).

    Args:
        video_id: YouTube video ID
        caption: Optional caption to append after iframe

    Returns:
        HTML string with youtube-embed-container div and iframe
    """
    proxy_url = get_youtube_proxy_url(video_id)

    html = (
        f'<div class="youtube-embed-container">'
        f'<iframe src="{proxy_url}" '
        f'title="YouTube video player" '
        f'width="560" '
        f'height="315" '
        f'frameborder="0" '
        f'scrolling="no" '
        f"allowfullscreen></iframe>"
    )

    if caption:
        html += caption

    html += "</div>"

    return html


def is_youtube_url(url: str) -> bool:
    """
    Check if a URL is a YouTube URL.

    Args:
        url: URL to check

    Returns:
        True if URL is from youtube.com or youtu.be
    """
    if not url:
        return False

    youtube_domains = ["youtube.com", "youtu.be", "m.youtube.com", "youtube-nocookie.com"]
    return any(domain in url for domain in youtube_domains)


def proxy_youtube_embeds(soup: BeautifulSoup) -> None:
    """
    Find and replace YouTube iframes with proxy embeds.

    Args:
        soup: BeautifulSoup object to modify in-place
    """
    for iframe in soup.find_all("iframe"):
        src = iframe.get("src", "")
        if not src:
            continue

        if is_youtube_url(src):
            video_id = extract_youtube_video_id(src)
            if video_id:
                # Create replacement HTML
                replacement_html = create_youtube_embed_html(video_id)
                replacement_soup = BeautifulSoup(replacement_html, "html.parser")

                # The first element should be the div
                new_tag = replacement_soup.find("div", class_="youtube-embed-container")
                if new_tag:
                    iframe.replace_with(new_tag)
