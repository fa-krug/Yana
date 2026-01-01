"""
Header element extraction orchestrator.

Coordinates multiple header element extraction strategies in a chain of responsibility.
Tries strategies in specific order (RedditEmbed BEFORE RedditPost) until one succeeds.
"""

import logging

from .context import HeaderElementContext
from .strategies import (
    HeaderElementStrategy,
    RedditEmbedStrategy,
    RedditPostStrategy,
    YouTubeStrategy,
    GenericImageStrategy,
)
from ...exceptions import ArticleSkipError

logger = logging.getLogger(__name__)


class HeaderElementExtractor:
    """
    Main orchestrator for header element extraction.

    Uses strategy pattern to try multiple header element extraction methods:
    1. RedditEmbedStrategy - Reddit video embeds (must be BEFORE RedditPostStrategy)
    2. RedditPostStrategy - Reddit subreddit icons
    3. YouTubeStrategy - YouTube video embeds
    4. GenericImageStrategy - Fallback for all other sources

    Strategy order is CRITICAL: RedditEmbedStrategy MUST come before
    RedditPostStrategy to avoid false positives.
    """

    def __init__(self):
        """Initialize extractor with strategies in correct order."""
        # CRITICAL: RedditEmbedStrategy must be BEFORE RedditPostStrategy
        self.strategies: list[HeaderElementStrategy] = [
            RedditEmbedStrategy(),
            RedditPostStrategy(),
            YouTubeStrategy(),
            GenericImageStrategy(),  # Must be last (fallback, accepts all URLs)
        ]

    async def extract_header_element(
        self, url: str, alt: str = "Article image"
    ) -> str | None:
        """
        Extract header element from URL using strategy chain.

        Tries strategies in order:
        1. Reddit embed (iframe)
        2. Reddit post (subreddit icon as base64 img)
        3. YouTube (embed iframe)
        4. Generic image extraction (base64 img)

        Args:
            url: URL to extract header element from
            alt: Alt text / title for element

        Returns:
            HTML string containing iframe or img tag, or None if extraction fails

        Raises:
            ArticleSkipError: On 4xx HTTP errors (article should be skipped)
        """
        if not url:
            logger.warning("Empty URL provided to extract_header_element")
            return None

        logger.debug(f"HeaderElementExtractor: Starting extraction from {url}")

        context = HeaderElementContext(url=url, alt=alt)

        # Try each strategy in order
        for strategy in self.strategies:
            strategy_name = strategy.__class__.__name__

            # Check if strategy can handle this URL
            if not strategy.can_handle(url):
                logger.debug(f"HeaderElementExtractor: {strategy_name} cannot handle URL")
                continue

            logger.debug(f"HeaderElementExtractor: Trying {strategy_name}")

            try:
                result = await strategy.create(context)

                if result:
                    logger.debug(
                        f"HeaderElementExtractor: Success with {strategy_name}"
                    )
                    return result

                # Strategy returned None, try next
                logger.debug(f"HeaderElementExtractor: {strategy_name} returned None")

            except ArticleSkipError as e:
                # Re-raise 4xx errors immediately - skip this article
                logger.warning(
                    f"HeaderElementExtractor: {strategy_name} raised ArticleSkipError: {e}"
                )
                raise

            except Exception as e:
                # Log error and try next strategy
                logger.debug(
                    f"HeaderElementExtractor: {strategy_name} raised exception: {e}"
                )

        # All strategies tried, none succeeded
        logger.debug("HeaderElementExtractor: All strategies failed")
        return None
