"""
YouTube utilities for header element extraction.

Provides functions for:
- Detecting and extracting YouTube video IDs
- Generating YouTube embed HTML
- Constructing thumbnail URLs
"""

import re
from typing import Optional


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
            if re.match(r"^[A-Za-z0-9_-]{11}$", video_id):
                return video_id
            # Also accept non-standard length IDs (some YouTube IDs can vary)
            elif re.match(r"^[A-Za-z0-9_-]+$", video_id):
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


def create_youtube_embed_html(video_id: str, caption: str = "") -> str:
    """
    Create HTML for embedded YouTube video.

    Generates an iframe element that uses a proxy endpoint for embedding
    (to avoid embedding YouTube's standard iframe which may have
    privacy/tracking considerations).

    Args:
        video_id: YouTube video ID
        caption: Optional caption to append after iframe

    Returns:
        HTML string with youtube-embed-container div and iframe
    """
    proxy_url = f"/api/youtube-proxy?v={video_id}"

    html = (
        f'<div class="youtube-embed-container">'
        f'<style>'
        f".youtube-embed-container iframe {{ "
        f"width: 100%; "
        f"height: calc((100% / 16) * 9); "
        f"aspect-ratio: 16 / 9; "
        f"}}"
        f"@media (max-width: 512px) {{ "
        f".youtube-embed-container {{ position: relative; }} "
        f".youtube-embed-container iframe {{ position: absolute; }} "
        f"}}"
        f"</style>"
        f'<iframe src="{proxy_url}" '
        f'title="YouTube video player" '
        f'frameborder="0" '
        f'scrolling="no" '
        f'allowfullscreen></iframe>'
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
