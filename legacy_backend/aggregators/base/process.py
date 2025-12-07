"""
Content processing and formatting for aggregators.

This module provides content processing functionality including:
- Removing unwanted HTML elements
- Sanitizing HTML
- Standardizing content format (adding header images, source links)
"""

import base64
import logging
from typing import TYPE_CHECKING
from urllib.parse import urljoin

from bs4 import BeautifulSoup

if TYPE_CHECKING:
    from .models import RawArticle

from .fetch import extract_image_from_url
from .utils import (
    compress_image,
    extract_youtube_video_id,
    remove_elements_by_selectors,
    sanitize_html,
)

logger = logging.getLogger(__name__)


# ============================================================================
# Content Standardization
# ============================================================================


def standardize_content_format(
    content: str,
    article: "RawArticle",
    base_url: str | None = None,
    generate_title_image: bool = True,
    add_source_footer: bool = True,
    header_image_url: str | None = None,
) -> str:
    """
    Standardize content format across all feeds.

    This function:
    1. Finds the first URL (link or image) in the content (if generate_title_image=True)
    2. Extracts an image from that URL (or uses meta tags, first image, or favicon)
    3. Compresses and inlines the image as base64
    4. Places the image at the top of the content
    5. Removes the original image tag if it was in the content
    6. Adds the content below the image
    7. Adds a source link at the bottom (float right) (if add_source_footer=True)

    Args:
        content: The HTML content to standardize
        article: The article being processed
        base_url: Optional base URL for resolving relative URLs (defaults to article.url)
        generate_title_image: Whether to extract and add a header image (default: True)
        add_source_footer: Whether to add a source link at the bottom (default: True)
        header_image_url: Optional pre-determined header image URL (overrides automatic detection)

    Returns:
        Standardized HTML content
    """
    if not base_url:
        base_url = article.url

    logger.debug(f"Standardizing content format for: {article.url}")

    try:
        soup = BeautifulSoup(content, "html.parser")

        # Build the standardized content
        content_parts = []

        # Extract and add header image if enabled
        if generate_title_image:
            # First, check if article.url is a YouTube video - embed it instead of extracting image
            article_video_id = extract_youtube_video_id(article.url)
            if article_video_id:
                from api.youtube import get_youtube_proxy_url

                embed_url = get_youtube_proxy_url(article_video_id)
                content_parts.append(
                    '<div class="youtube-embed-container">'
                    f'<iframe width="560" height="315" src="{embed_url}" '
                    'title="YouTube video player" '
                    'frameborder="0" '
                    'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" '
                    "allowfullscreen></iframe>"
                    "</div>"
                )
                logger.debug(f"Added YouTube embed for video: {article_video_id}")
                # Skip image extraction for YouTube videos
            else:
                # Find the first URL (link or image)
                first_url = None
                first_element = None

                # First, check for YouTube links in content (they take priority over header images)
                first_link = soup.find("a", href=True)
                if first_link:
                    link_url = urljoin(base_url, first_link["href"])
                    if extract_youtube_video_id(link_url):
                        first_url = link_url
                        first_element = first_link
                        logger.debug(f"Found YouTube link in content: {first_url}")

                # If no YouTube link found, use pre-determined header image URL if provided
                is_using_header_image = False
                if not first_url and header_image_url:
                    # Resolve relative URLs to absolute URLs
                    first_url = urljoin(base_url, header_image_url)
                    is_using_header_image = True
                    logger.debug(f"Using pre-determined header image: {first_url}")
                elif not first_url:
                    # First, try to find an image
                    first_img = soup.find("img")
                    if first_img:
                        img_src = (
                            first_img.get("src")
                            or first_img.get("data-src")
                            or first_img.get("data-lazy-src")
                        )
                        if img_src:
                            first_url = urljoin(base_url, img_src)
                            first_element = first_img
                            logger.debug(f"Found first image: {first_url}")

                    # If no image, try to find first link
                    if not first_url and first_link:
                        first_url = urljoin(base_url, first_link["href"])
                        first_element = first_link
                        logger.debug(f"Found first link: {first_url}")

                    # If still no URL, use the article URL itself
                    if not first_url:
                        first_url = article.url
                        logger.debug(
                            f"No URL found in content, using article URL: {article.url}"
                        )

                # Check if URL is a YouTube video - embed it instead of extracting image
                video_id = extract_youtube_video_id(first_url)
                if video_id:
                    from api.youtube import get_youtube_proxy_url

                    embed_url = get_youtube_proxy_url(video_id)
                    content_parts.append(
                        '<div class="youtube-embed-container">'
                        f'<iframe width="560" height="315" src="{embed_url}" '
                        'title="YouTube video player" '
                        'frameborder="0" '
                        'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" '
                        "allowfullscreen></iframe>"
                        "</div>"
                    )
                    logger.debug(f"Added YouTube embed for video: {video_id}")

                    # Remove the original link/image from content
                    if first_element:
                        parent = first_element.parent
                        first_element.decompose()
                        # Remove empty parent containers recursively
                        while parent and parent.name not in (
                            "body",
                            "[document]",
                            "html",
                        ):
                            if not parent.get_text(strip=True) and not parent.find():
                                next_parent = parent.parent
                                parent.decompose()
                                parent = next_parent
                            else:
                                break
                        logger.debug("Removed original YouTube link/image from content")
                else:
                    # Extract image from the URL or data URI
                    image_result = None

                    # Check if the URL is already a data URI (base64 encoded)
                    if first_url.startswith("data:"):
                        logger.debug(
                            "First image is already a data URI, extracting data"
                        )
                        try:
                            # Parse data URI: data:image/png;base64,iVBORw0KG...
                            if ";base64," in first_url:
                                header, encoded = first_url.split(";base64,", 1)
                                content_type = (
                                    header.split(":", 1)[1]
                                    if ":" in header
                                    else "image/jpeg"
                                )

                                # CRITICAL: Validate that data URI is actually an image
                                if not content_type.startswith("image/"):
                                    logger.warning(
                                        f"Data URI has non-image content type: {content_type}, skipping"
                                    )
                                else:
                                    image_data = base64.b64decode(encoded)

                                    # Additional validation: Try to parse as image with PIL
                                    try:
                                        import io

                                        from PIL import Image

                                        img = Image.open(io.BytesIO(image_data))
                                        img.verify()  # Verify it's actually a valid image
                                        image_result = (image_data, content_type)
                                        logger.debug(
                                            f"Extracted valid data URI image: {content_type}, {len(image_data)} bytes"
                                        )
                                    except Exception as pil_error:
                                        logger.warning(
                                            f"Data URI claims to be {content_type} but failed PIL validation: {pil_error}"
                                        )
                        except Exception as e:
                            logger.error(f"Failed to parse data URI: {e}")
                    else:
                        # Extract image from regular URL
                        # If this is a header_image_url, pass flag to skip width/height filtering
                        image_result = extract_image_from_url(
                            first_url, is_header_image=is_using_header_image
                        )
                        # Save thumbnail URL for non-data URIs (actual URLs)
                        if image_result:
                            article.thumbnail_url = first_url
                            logger.debug(f"Saved thumbnail URL: {first_url}")

                    # Add the header image if we found one
                    if image_result:
                        image_data, content_type = image_result

                        # Compress the image
                        compressed_data, output_type = compress_image(
                            image_data, content_type
                        )

                        # Convert to base64
                        image_b64 = base64.b64encode(compressed_data).decode("utf-8")
                        data_uri = f"data:{output_type};base64,{image_b64}"

                        # Add image at the top
                        content_parts.append(
                            f'<p><img src="{data_uri}" alt="Article image" style="max-width: 100%; height: auto;"></p>'
                        )
                        logger.debug("Added header image to content")

                        # Remove the original image from content if it was an img tag
                        if first_element and first_element.name == "img":
                            parent = first_element.parent
                            first_element.decompose()
                            # Remove empty parent containers recursively
                            while parent and parent.name not in (
                                "body",
                                "[document]",
                                "html",
                            ):
                                if (
                                    not parent.get_text(strip=True)
                                    and not parent.find()
                                ):
                                    next_parent = parent.parent
                                    parent.decompose()
                                    parent = next_parent
                                else:
                                    break
                            logger.debug("Removed original image from content")

        # Add the remaining content
        content_parts.append(str(soup))

        # Add source link at the bottom (float right) if enabled
        if add_source_footer:
            content_parts.append(
                f'<a href="{article.url}" style="float: right;">Source</a>'
            )

        return "".join(content_parts)

    except Exception as e:
        logger.error(f"Error standardizing content format: {e}", exc_info=True)
        # Fallback: add source link if enabled
        if add_source_footer:
            return f'{content}<a href="{article.url}" style="float: right;">Source</a>'
        return content


# ============================================================================
# Processing Mixin for BaseAggregator
# ============================================================================


class ProcessingMixin:
    """
    Mixin providing content processing functionality for aggregators.

    This mixin provides methods for processing HTML content:
    - Removing unwanted elements (ads, social buttons, etc.)
    - Sanitizing HTML (removing scripts, iframes, etc.)
    - Standardizing format (adding header images, source links)
    """

    def get_header_image_url(self, article: "RawArticle") -> str | None:
        """
        Extract the header image URL from the article's full HTML.

        Override this method to provide custom header image extraction logic.
        This is called before content extraction, so article.html contains the
        full page HTML.

        The returned URL will be used as the header image in the final article,
        bypassing the automatic image detection in standardize_content_format.

        Args:
            article: The article being processed (with full HTML)

        Returns:
            The header image URL, or None to use automatic detection

        Example:
            >>> def get_header_image_url(self, article: RawArticle) -> str | None:
            ...     soup = BeautifulSoup(article.html, 'html.parser')
            ...     header_img = soup.find('div', id='header').find('img')
            ...     return header_img['src'] if header_img else None
        """
        return None  # Default: use automatic detection

    def remove_unwanted_elements(self, article: "RawArticle") -> None:
        """
        Remove unwanted HTML elements (ads, social buttons, etc.)

        Override this if you need custom removal logic beyond CSS selectors.

        Reads from article.html and updates it with cleaned content.

        Args:
            article: The article being processed (reads/writes article.html)
        """
        if not self.selectors_to_remove:
            return

        article.html = remove_elements_by_selectors(
            article.html,
            self.selectors_to_remove,
            remove_empty=True,
        )

    def sanitize_content(self, article: "RawArticle") -> None:
        """
        Sanitize HTML content (remove scripts, iframes, etc.)

        Override this if you need custom sanitization logic.

        Reads from article.html and updates it with sanitized content.

        Args:
            article: The article being processed (reads/writes article.html)
        """
        article.html = sanitize_html(article.html)

    def standardize_format(
        self, article: "RawArticle", header_image_url: str | None = None
    ) -> None:
        """
        Standardize content format (add header image, source link, etc.)

        Override this to customize the final formatting.

        Reads from article.html and updates it with standardized content.

        Args:
            article: The article being processed (reads/writes article.html)
            header_image_url: Optional pre-determined header image URL
        """
        article.html = standardize_content_format(
            article.html,
            article,
            generate_title_image=self.feed.generate_title_image if self.feed else True,
            add_source_footer=self.feed.add_source_footer if self.feed else True,
            header_image_url=header_image_url,
        )
