"""
Header element extraction strategies using Strategy Pattern.

Provides strategies for extracting header elements (HTML) from different sources:
1. RedditEmbedStrategy - Reddit video embeds (vxreddit.com, reddit.com/embed)
2. RedditPostStrategy - Reddit post subreddit icons (fetches icon, compresses to base64)
3. YouTubeStrategy - YouTube video iframes
4. GenericImageStrategy - Fallback for all other sources (uses ImageExtractor)
"""

import logging
from abc import ABC, abstractmethod

from core.aggregators.exceptions import ArticleSkipError
from core.aggregators.utils.reddit import (
    create_reddit_embed_html,
    extract_post_info_from_url,
    fetch_subreddit_icon,
    is_reddit_embed_url,
)
from core.aggregators.utils.youtube import (
    create_youtube_embed_html,
    extract_youtube_video_id,
)
from core.aggregators.services.image_extraction.compression import (
    compress_and_encode_image,
    create_image_element,
)
from core.aggregators.services.image_extraction.extractor import ImageExtractor
from core.aggregators.services.image_extraction.fetcher import fetch_single_image
from core.aggregators.services.header_element.context import HeaderElementContext

logger = logging.getLogger(__name__)


class HeaderElementStrategy(ABC):
    """Base class for header element extraction strategies."""

    @abstractmethod
    def can_handle(self, url: str) -> bool:
        """Check if this strategy can handle the URL."""
        pass

    @abstractmethod
    async def create(self, context: HeaderElementContext) -> str | None:
        """
        Create header element HTML.

        Returns:
            HTML string containing iframe or img tag, or None if creation fails
        """
        pass


class RedditEmbedStrategy(HeaderElementStrategy):
    """Strategy for Reddit video embeds."""

    def can_handle(self, url: str) -> bool:
        """Check if URL is a Reddit embed URL."""
        return is_reddit_embed_url(url)

    async def create(self, context: HeaderElementContext) -> str | None:
        """Create Reddit embed iframe."""
        logger.debug(f"RedditEmbedStrategy: Creating embed for {context.url}")

        try:
            embed_html = create_reddit_embed_html(context.url)
            logger.debug("RedditEmbedStrategy: Successfully created embed")
            return embed_html
        except Exception as e:
            logger.warning(f"RedditEmbedStrategy: Failed - {e}")
            return None


class RedditPostStrategy(HeaderElementStrategy):
    """Strategy for Reddit post subreddit icons."""

    def can_handle(self, url: str) -> bool:
        """Check if URL is a Reddit post (but not an embed)."""
        # Must NOT be an embed URL (RedditEmbedStrategy handles those)
        if is_reddit_embed_url(url):
            return False

        post_info = extract_post_info_from_url(url)
        return post_info["subreddit"] is not None

    async def create(self, context: HeaderElementContext) -> str | None:
        """Fetch subreddit icon and create base64 image element."""
        logger.debug(f"RedditPostStrategy: Extracting icon for {context.url}")

        try:
            post_info = extract_post_info_from_url(context.url)
            subreddit = post_info.get("subreddit")

            if not subreddit:
                return None

            # Fetch subreddit icon URL
            icon_url = fetch_subreddit_icon(subreddit)
            if not icon_url:
                logger.debug(f"RedditPostStrategy: No icon found for r/{subreddit}")
                return None

            # Fetch the icon image
            image_result = fetch_single_image(icon_url)
            if not image_result:
                logger.debug(f"RedditPostStrategy: Failed to fetch icon from {icon_url}")
                return None

            # Compress and encode
            encode_result = compress_and_encode_image(
                image_result["imageData"],
                image_result["contentType"],
            )

            if not encode_result:
                logger.debug("RedditPostStrategy: Failed to compress image")
                return None

            # Create img element
            img_html = create_image_element(encode_result["dataUri"], context.alt)

            logger.debug("RedditPostStrategy: Successfully created image element")
            return img_html

        except ArticleSkipError:
            raise
        except Exception as e:
            logger.warning(f"RedditPostStrategy: Failed - {e}")
            return None


class YouTubeStrategy(HeaderElementStrategy):
    """Strategy for YouTube video embeds."""

    def can_handle(self, url: str) -> bool:
        """Check if URL is a YouTube URL."""
        return extract_youtube_video_id(url) is not None

    async def create(self, context: HeaderElementContext) -> str | None:
        """Create YouTube embed iframe."""
        logger.debug(f"YouTubeStrategy: Creating embed for {context.url}")

        try:
            video_id = extract_youtube_video_id(context.url)
            if not video_id:
                return None

            embed_html = create_youtube_embed_html(video_id)
            logger.debug("YouTubeStrategy: Successfully created embed")
            return embed_html

        except Exception as e:
            logger.warning(f"YouTubeStrategy: Failed - {e}")
            return None


class GenericImageStrategy(HeaderElementStrategy):
    """Strategy for extracting images from any URL (fallback)."""

    def can_handle(self, url: str) -> bool:
        """Check if this is any other URL (fallback strategy)."""
        # Skip v.redd.it non-embed URLs (they don't work for image extraction)
        if "v.redd.it" in url and not is_reddit_embed_url(url):
            logger.debug("GenericImageStrategy: Skipping v.redd.it non-embed URL")
            return False

        # Accept all other URLs (fallback)
        return True

    async def create(self, context: HeaderElementContext) -> str | None:
        """Extract image using ImageExtractor."""
        logger.debug(f"GenericImageStrategy: Extracting from {context.url}")

        extractor = None
        try:
            extractor = ImageExtractor()
            image_result = await extractor.extract_image_from_url(context.url, is_header_image=True)

            if not image_result:
                logger.debug("GenericImageStrategy: No image extracted")
                return None

            # Compress and encode
            encode_result = compress_and_encode_image(
                image_result["imageData"],
                image_result["contentType"],
                is_header=True,
            )

            if not encode_result:
                logger.debug("GenericImageStrategy: Failed to compress image")
                return None

            # Create img element
            img_html = create_image_element(encode_result["dataUri"], context.alt)

            logger.debug("GenericImageStrategy: Successfully extracted and encoded image")
            return img_html

        except ArticleSkipError:
            raise
        except Exception as e:
            logger.warning(f"GenericImageStrategy: Failed - {e}")
            return None
        finally:
            # Close extractor's browser if it was opened
            if extractor:
                import contextlib
                with contextlib.suppress(Exception):
                    await extractor.close()
