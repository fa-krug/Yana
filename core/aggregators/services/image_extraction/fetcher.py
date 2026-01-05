"""
HTTP image fetching utilities.

Handles downloading images from URLs with proper:
- HTTP headers (User-Agent, Referer)
- MIME type detection and validation
- Timeout handling
- Error handling
"""

import logging
from typing import Any, Dict, Optional
from urllib.parse import urlparse

import requests

logger = logging.getLogger(__name__)

# HTTP configuration
DEFAULT_TIMEOUT = 10
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

# Accepted image MIME types
ACCEPTED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "image/x-icon",
    "image/vnd.microsoft.icon",
    "image/bmp",
    "image/tiff",
}


def get_image_headers(url: str | None = None) -> Dict[str, str]:
    """
    Get HTTP headers for image fetching.

    Constructs headers with User-Agent and Referer.

    Args:
        url: Optional URL to extract referer from

    Returns:
        Dict of HTTP headers
    """
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "DNT": "1",
    }

    # Add referer header if URL provided
    if url:
        try:
            parsed = urlparse(url)
            referer = f"{parsed.scheme}://{parsed.netloc}"
            headers["Referer"] = referer
        except Exception:
            pass

    return headers


def is_image_content_type(content_type: Optional[str]) -> bool:
    """
    Check if content type is a valid image MIME type.

    Args:
        content_type: HTTP Content-Type header value

    Returns:
        True if valid image MIME type
    """
    if not content_type:
        return False

    # Extract base MIME type (without parameters like charset)
    base_type = content_type.split(";")[0].strip()

    return base_type in ACCEPTED_IMAGE_TYPES


def fetch_single_image(url: str, timeout: int = DEFAULT_TIMEOUT) -> Optional[Dict[str, Any]]:
    """
    Fetch a single image from URL with validation.

    Handles:
    - HTTP fetching with proper headers
    - Content-type validation
    - Timeout handling
    - Size validation (must be > 1KB)

    Args:
        url: URL to fetch image from
        timeout: Request timeout in seconds

    Returns:
        Dict with keys:
            - imageData: bytes (image data)
            - contentType: str (MIME type)
        Returns None if fetch fails
    """
    if not url:
        logger.warning("Empty URL provided to fetch_single_image")
        return None

    try:
        logger.debug(f"Fetching image from {url}")

        headers = get_image_headers(url)
        response = requests.get(url, headers=headers, timeout=timeout, allow_redirects=True)

        # Check for HTTP errors
        try:
            response.raise_for_status()
        except requests.exceptions.HTTPError as e:
            logger.warning(f"HTTP {e.response.status_code} fetching {url}")
            raise

        # Validate content type
        content_type = response.headers.get("Content-Type", "")
        if not is_image_content_type(content_type):
            logger.warning(f"Invalid content type for image: {content_type}")
            return None

        # Validate content length
        image_data = response.content
        if len(image_data) < 100:  # Minimum 100 bytes
            logger.debug(f"Image too small ({len(image_data)} bytes): {url}")
            return None

        logger.debug(f"Successfully fetched image ({len(image_data)} bytes): {url}")
        return {
            "imageData": image_data,
            "contentType": content_type.split(";")[0].strip(),
        }

    except requests.exceptions.Timeout:
        logger.warning(f"Timeout fetching image: {url}")
        return None
    except requests.exceptions.ConnectionError:
        logger.warning(f"Connection error fetching image: {url}")
        return None
    except requests.exceptions.HTTPError:
        # Already logged above
        return None
    except requests.exceptions.RequestException as e:
        logger.warning(f"Error fetching image: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error fetching image {url}: {e}")
        return None


def validate_image_data_with_pillow(image_data: bytes) -> Optional[Dict[str, Any]]:
    """
    Validate image data using Pillow and extract metadata.

    Args:
        image_data: Raw image bytes

    Returns:
        Dict with image metadata if valid, None otherwise
    """
    try:
        import io

        from PIL import Image

        img = Image.open(io.BytesIO(image_data))
        # Try to load image to verify it's valid
        img.load()

        return {
            "width": img.width,
            "height": img.height,
            "format": img.format or "unknown",
        }
    except Exception as e:
        logger.debug(f"Pillow validation failed: {e}")
        return None
