"""
Utility functions for content processing and validation.

This module provides standalone utility functions used throughout the aggregation system:
- Content age validation
- Article skip logic
- Image compression
- HTML element removal and sanitization
- YouTube video ID extraction
- RSS content extraction
"""

import io
import logging
import re
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any
from urllib.parse import parse_qs, urlparse

from bs4 import BeautifulSoup
from django.utils import timezone
from PIL import Image

if TYPE_CHECKING:
    from .models import RawArticle

logger = logging.getLogger(__name__)

# Content age filtering
CONTENT_MAX_AGE_MONTHS = 2  # Skip content older than 2 months

# Image compression settings
MAX_IMAGE_WIDTH = 600  # Reduced from 800 for faster processing
MAX_IMAGE_HEIGHT = 600  # Reduced from 800 for faster processing
JPEG_QUALITY = 65  # Reduced from 75 for smaller files
WEBP_QUALITY = 65  # WebP quality (better compression than JPEG)
PREFER_WEBP = True  # Use WebP format when possible (25-35% smaller)


# ============================================================================
# Content Validation Utilities
# ============================================================================


def is_content_too_old(
    published_date: datetime, max_age_months: int = CONTENT_MAX_AGE_MONTHS
) -> bool:
    """
    Check if content is too old to aggregate based on publication date.

    Args:
        published_date: The publication date of the content (aware datetime)
        max_age_months: Maximum age in months (default: CONTENT_MAX_AGE_MONTHS)

    Returns:
        True if content is older than max_age_months, False otherwise
    """
    if not published_date:
        return False

    # Ensure published_date is timezone-aware
    if timezone.is_naive(published_date):
        published_date = timezone.make_aware(published_date)

    cutoff_date = timezone.now() - timedelta(days=max_age_months * 30)
    is_old = published_date < cutoff_date

    if is_old:
        logger.debug(
            f"Content from {published_date.date()} is older than {max_age_months} months (cutoff: {cutoff_date.date()})"
        )

    return is_old


def should_skip_article(
    article: "RawArticle",
    force_refresh: bool = False,
) -> tuple[bool, str | None]:
    """
    Check if an article should be skipped during aggregation.

    Consolidates common skip logic across all aggregators:
    1. Skip if no URL
    2. Skip if already exists (unless force_refresh)
    3. Skip if too old (older than CONTENT_MAX_AGE_MONTHS)

    Args:
        article: The article to check
        force_refresh: If True, don't skip existing articles

    Returns:
        Tuple of (should_skip: bool, reason: str | None)
        - If should_skip is True, reason contains a log message explaining why
        - If should_skip is False, reason is None
    """
    # Import here to avoid circular dependency
    from core.models import Article

    # Check 1: No URL
    if not article.url:
        return True, f"Skipping entry with no URL: {article.title}"

    # Check 2: Already exists (unless force_refresh)
    if not force_refresh and Article.objects.filter(url=article.url).exists():
        return True, None  # Don't log for existing articles (too verbose)

    # Check 3: Too old
    if is_content_too_old(article.date):
        return True, f"Skipping old article from {article.date.date()}: {article.title}"

    # Don't skip
    return False, None


# ============================================================================
# Image Processing Utilities
# ============================================================================


def compress_image(
    image_data: bytes,
    content_type: str,
    max_width: int | None = None,
    max_height: int | None = None,
    use_webp: bool | None = None,
) -> tuple[bytes, str]:
    """
    Compress and resize an image to reduce its size.

    Uses WebP format by default for better compression (25-35% smaller than JPEG).
    Falls back to JPEG with progressive encoding for compatibility.

    Args:
        image_data: Raw image bytes
        content_type: MIME type of the image
        max_width: Maximum width (defaults to MAX_IMAGE_WIDTH if not specified)
        max_height: Maximum height (defaults to MAX_IMAGE_HEIGHT if not specified)
        use_webp: Whether to use WebP format (defaults to PREFER_WEBP setting)

    Returns:
        Tuple of (compressed image bytes, output content type)
    """
    try:
        # Use provided dimensions or fall back to defaults
        target_max_width = max_width if max_width is not None else MAX_IMAGE_WIDTH
        target_max_height = max_height if max_height is not None else MAX_IMAGE_HEIGHT
        should_use_webp = use_webp if use_webp is not None else PREFER_WEBP

        # Skip very small images (likely icons or already optimized)
        if len(image_data) < 5000:  # Less than 5KB (reduced from 10KB)
            return image_data, content_type

        # Open image with PIL
        img = Image.open(io.BytesIO(image_data))

        # Get original dimensions
        original_width, original_height = img.size

        # Skip if already small enough and in WebP format (best compression)
        if (
            original_width <= target_max_width
            and original_height <= target_max_height
            and content_type == "image/webp"
            and len(image_data) < 50000  # Less than 50KB (reduced from 100KB)
        ):
            return image_data, content_type

        # Calculate new dimensions while maintaining aspect ratio
        if original_width > target_max_width or original_height > target_max_height:
            ratio = min(
                target_max_width / original_width, target_max_height / original_height
            )
            new_width = int(original_width * ratio)
            new_height = int(original_height * ratio)
            img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            logger.debug(
                f"Resized image from {original_width}x{original_height} to {new_width}x{new_height}"
            )

        # Check if image has transparency (alpha channel)
        has_transparency = (
            img.mode in ("RGBA", "LA", "P")
            and "transparency" in img.info
            or img.mode == "RGBA"
        )

        # Determine output format and save
        output_buffer = io.BytesIO()

        if should_use_webp:
            # WebP supports transparency, so no need to convert
            if img.mode == "P":
                img = img.convert("RGBA" if has_transparency else "RGB")
            elif img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGB")

            img.save(
                output_buffer,
                format="WEBP",
                quality=WEBP_QUALITY,
                method=4,  # Compression method (0-6, higher = slower but smaller)
            )
            output_type = "image/webp"
        elif has_transparency and img.mode == "RGBA":
            # Keep PNG for images with transparency when WebP not used
            img.save(output_buffer, format="PNG", optimize=True)
            output_type = "image/png"
        else:
            # Convert to RGB and save as progressive JPEG
            if img.mode in ("RGBA", "LA", "P"):
                # Convert to RGB, filling transparent areas with white
                background = Image.new("RGB", img.size, (255, 255, 255))
                if img.mode == "P":
                    img = img.convert("RGBA")
                background.paste(
                    img, mask=img.split()[-1] if img.mode == "RGBA" else None
                )
                img = background
            elif img.mode != "RGB":
                img = img.convert("RGB")

            img.save(
                output_buffer,
                format="JPEG",
                quality=JPEG_QUALITY,
                optimize=True,
                progressive=True,  # Progressive encoding for better perceived loading
            )
            output_type = "image/jpeg"

        compressed_data = output_buffer.getvalue()
        compression_ratio = len(compressed_data) / len(image_data) if image_data else 1
        logger.debug(
            f"Compressed image to {output_type}: {len(image_data)} -> {len(compressed_data)} bytes ({compression_ratio:.1%})"
        )

        return compressed_data, output_type

    except Exception as e:
        logger.warning(f"Failed to compress image: {e}")
        # Return original data if compression fails
        return image_data, content_type


# ============================================================================
# HTML Processing Utilities
# ============================================================================


def remove_elements_by_selectors(
    html: str, selectors: list[str] | None = None, remove_empty: bool = False
) -> str:
    """
    Remove HTML elements matching the given CSS selectors.

    This function allows removal of specific elements from HTML content using CSS selectors.
    Useful for removing site-specific unwanted elements (ads, social media widgets, etc.)

    Args:
        html: HTML content to process
        selectors: List of CSS selectors for elements to remove (e.g., ['.ad-container', '#social-share'])
        remove_empty: If True, also remove empty p, div, and span elements that contain no text or images

    Returns:
        HTML with specified elements removed

    Example:
        >>> html = '<div class="content">Text</div><div class="ad">Ad</div>'
        >>> remove_elements_by_selectors(html, ['.ad'])
        '<div class="content">Text</div>'
    """
    if not selectors and not remove_empty:
        logger.debug(
            "No selectors provided and remove_empty=False, returning HTML unchanged"
        )
        return html

    logger.debug(
        f"Removing elements matching {len(selectors) if selectors else 0} selectors"
    )

    try:
        soup = BeautifulSoup(html, "html.parser")
        removed_count = 0

        # Remove elements by selectors
        if selectors:
            for selector in selectors:
                try:
                    elements = soup.select(selector)
                    for element in elements:
                        element.decompose()
                        removed_count += 1
                    if elements:
                        logger.debug(
                            f"Removed {len(elements)} element(s) matching selector: {selector}"
                        )
                except Exception as e:
                    logger.warning(
                        f"Failed to remove elements with selector '{selector}': {e}"
                    )

        # Remove empty elements if requested
        if remove_empty:
            empty_count = 0
            for tag in soup.find_all(["p", "div", "span"]):
                if not tag.get_text(strip=True) and not tag.find("img"):
                    tag.decompose()
                    empty_count += 1
            if empty_count > 0:
                logger.debug(f"Removed {empty_count} empty element(s)")
            removed_count += empty_count

        logger.debug(f"Total elements removed: {removed_count}")
        return str(soup)

    except Exception as e:
        logger.error(f"Error removing elements by selectors: {e}", exc_info=True)
        return html


def sanitize_html(html: str) -> str:
    """
    Sanitize HTML content, removing scripts and other potentially harmful elements.

    Args:
        html: Raw HTML content

    Returns:
        Sanitized HTML content
    """
    logger.debug("Sanitizing HTML content")

    try:
        soup = BeautifulSoup(html, "html.parser")

        # Remove script and style elements
        for script in soup(["script", "style", "iframe", "object", "embed"]):
            script.decompose()

        # Rename class, style, id, and data attributes to disable original styling/behavior
        for tag in soup.find_all(True):
            # Rename class attribute
            if tag.get("class"):
                tag["data-sanitized-class"] = (
                    " ".join(tag["class"])
                    if isinstance(tag["class"], list)
                    else tag["class"]
                )
                del tag["class"]
            # Rename inline styles
            if tag.get("style"):
                tag["data-sanitized-style"] = tag["style"]
                del tag["style"]
            # Rename id attribute (can be used for styling)
            if tag.get("id"):
                tag["data-sanitized-id"] = tag["id"]
                del tag["id"]
            # Rename data-* attributes (except data-src and data-srcset which are needed for images)
            attrs_to_rename = [
                attr
                for attr in list(tag.attrs.keys())
                if attr.startswith("data-")
                and attr not in ["data-src", "data-srcset"]
                and not attr.startswith("data-sanitized-")
            ]
            for attr in attrs_to_rename:
                tag[f"data-sanitized-{attr}"] = tag[attr]
                del tag[attr]

        sanitized = str(soup)
        logger.debug(f"HTML sanitized, length: {len(sanitized)} chars")

        return sanitized

    except Exception as e:
        logger.error(f"Error sanitizing HTML: {e}", exc_info=True)
        return html


# ============================================================================
# RSS and Content Extraction Utilities
# ============================================================================


def extract_entry_content(entry: Any) -> str:
    """
    Extract content from an RSS feed entry.

    This function tries to get content from various RSS fields in order of preference:
    1. entry.content (full content)
    2. entry.summary
    3. entry.description

    Args:
        entry: A feedparser entry object

    Returns:
        HTML content from the entry, or a placeholder if no content is found
    """
    content = ""

    # Try to get content from various RSS fields
    if hasattr(entry, "content") and entry.content:
        # Some feeds have multiple content entries
        content = entry.content[0].get("value", "")
    elif hasattr(entry, "summary") and entry.summary:
        content = entry.summary
    elif hasattr(entry, "description") and entry.description:
        content = entry.description

    if not content:
        logger.warning(f"No content found for entry: {entry.get('title', 'Unknown')}")
        content = "<p>No content available for this article.</p>"

    return content


def extract_youtube_video_id(url: str) -> str | None:
    """
    Extract the video ID from a YouTube URL.

    Supports various YouTube URL formats:
    - https://www.youtube.com/watch?v=VIDEO_ID
    - https://youtu.be/VIDEO_ID
    - https://www.youtube.com/embed/VIDEO_ID
    - https://youtube.com/shorts/VIDEO_ID

    Args:
        url: The YouTube URL to parse

    Returns:
        The video ID if found, None otherwise
    """
    try:
        parsed = urlparse(url)
        video_id = None

        # Handle youtu.be short URLs
        if parsed.netloc in ("youtu.be", "www.youtu.be"):
            video_id = parsed.path.lstrip("/").split("?")[0].split("&")[0]

        # Handle youtube.com URLs
        elif parsed.netloc in ("youtube.com", "www.youtube.com", "m.youtube.com"):
            # /watch?v=VIDEO_ID
            if parsed.path == "/watch" or parsed.path == "/watch/":
                query_params = parse_qs(parsed.query)
                if "v" in query_params and query_params["v"]:
                    video_id = query_params["v"][0]

            # /embed/VIDEO_ID or /v/VIDEO_ID
            elif (
                parsed.path.startswith("/embed/")
                or parsed.path.startswith("/v/")
                or parsed.path.startswith("/shorts/")
            ):
                parts = parsed.path.split("/")
                if len(parts) > 2:
                    video_id = parts[2].split("?")[0]

        # Validate video ID format (typically 11 characters, alphanumeric with - and _)
        if video_id and re.match(r"^[\w-]+$", video_id):
            return video_id

        return None
    except Exception as e:
        logger.debug(f"Failed to extract YouTube video ID from {url}: {e}")
        return None
