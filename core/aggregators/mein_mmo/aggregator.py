"""Mein-MMO aggregator implementation."""

from typing import Any, Dict

from ..website import FullWebsiteAggregator
from ..utils import format_article_content, clean_html
from .content_extraction import extract_mein_mmo_content
from .multipage_handler import detect_pagination, fetch_all_pages
from .utils import extract_header_image_url


class MeinMmoAggregator(FullWebsiteAggregator):
    """Specialized aggregator for Mein-MMO.de gaming news."""

    def __init__(self, feed):
        super().__init__(feed)
        # Use Mein-MMO RSS feed if identifier is not set
        if not self.identifier or self.identifier == "":
            self.identifier = "https://mein-mmo.de/feed/"

    # Mein-MMO specific selectors
    content_selector = "div.gp-entry-content"

    selectors_to_remove = [
        "div.wp-block-mmo-video",
        "div.wp-block-mmo-recirculation-box",
        "div.reading-position-indicator-end",
        "label.toggle",
        "a.wp-block-mmo-content-box",
        "ul.page-numbers",
        ".post-page-numbers",
        "#ftwp-container-outer",
        "script",
        "style",
        "iframe",
        "noscript",
    ]

    def fetch_article_content(self, url: str) -> str:
        """
        Fetch article content, handling multi-page articles.

        Multi-page is always enabled - fetches all pages and combines them.
        """
        # Fetch first page to detect pagination
        first_page_html = super().fetch_article_content(url)

        # Check if multi-page
        page_numbers = detect_pagination(first_page_html, self.logger)

        if len(page_numbers) <= 1:
            # Single page article
            self.logger.debug(f"Single page article: {url}")
            return first_page_html

        # Multi-page article - fetch all pages
        self.logger.info(f"Multi-page article detected: {len(page_numbers)} pages for {url}")

        combined_html = fetch_all_pages(
            base_url=url,
            page_numbers=page_numbers,
            fetcher=lambda page_url: super(MeinMmoAggregator, self).fetch_article_content(page_url),
            logger=self.logger,
        )

        return combined_html

    def extract_content(self, html: str, article: Dict[str, Any]) -> str:
        """Extract Mein-MMO specific content."""
        return extract_mein_mmo_content(
            html=html, article=article, selectors_to_remove=self.selectors_to_remove, logger=self.logger
        )

    def process_content(self, html: str, article: Dict[str, Any]) -> str:
        """Process Mein-MMO content with header image extraction."""
        # Extract header image from original HTML
        header_image_url = None
        try:
            # Re-fetch first page to get header image
            first_page_html = super().fetch_article_content(article["identifier"])
            header_image_url = extract_header_image_url(first_page_html, self.logger)
        except Exception as e:
            self.logger.warning(f"Failed to extract header image: {e}")

        # Clean HTML
        cleaned = clean_html(html)

        # Format with header and footer
        formatted = format_article_content(
            cleaned,
            title=article["name"],
            url=article["identifier"],
            author=article.get("author"),
            date=article.get("date"),
            header_image_url=header_image_url,
        )

        return formatted
