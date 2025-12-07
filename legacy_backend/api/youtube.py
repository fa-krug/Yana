"""
YouTube proxy utilities for the Yana RSS feed aggregator.
"""

from django.conf import settings
from django.urls import reverse


def get_youtube_proxy_url(video_id: str) -> str:
    """
    Get the YouTube proxy URL for embedding a video.

    Args:
        video_id: YouTube video ID

    Returns:
        Full URL to the YouTube proxy endpoint (e.g., https://yana.da-krug.de/api/youtube-proxy?v=VIDEO_ID)
    """
    base_url = getattr(settings, "BASE_URL", "")
    if not base_url:
        # Fallback to localhost if BASE_URL is not set
        base_url = "http://localhost:8000"

    # Remove trailing slash if present
    base_url = base_url.rstrip("/")

    # Construct the proxy URL
    proxy_path = reverse("youtube_proxy")
    return f"{base_url}{proxy_path}?v={video_id}"
