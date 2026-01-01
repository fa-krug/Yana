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
        self.logger.debug(f"[fetch_article_content] Starting for URL: {url}")

        # Fetch first page to detect pagination
        self.logger.debug(f"[fetch_article_content] Fetching first page")
        first_page_html = super().fetch_article_content(url)
        self.logger.debug(f"[fetch_article_content] First page fetched ({len(first_page_html)} bytes)")

        # Check if multi-page
        self.logger.debug(f"[fetch_article_content] Detecting pagination")
        page_numbers = detect_pagination(first_page_html, self.logger)

        if len(page_numbers) <= 1:
            # Single page article
            self.logger.info(f"[fetch_article_content] Single page article detected for {url}")
            return first_page_html

        # Multi-page article - fetch all pages
        self.logger.info(f"[fetch_article_content] Multi-page article detected: {len(page_numbers)} pages")

        combined_html = fetch_all_pages(
            base_url=url,
            page_numbers=page_numbers,
            fetcher=lambda page_url: super(MeinMmoAggregator, self).fetch_article_content(page_url),
            logger=self.logger,
        )

        self.logger.debug(f"[fetch_article_content] Returning combined HTML ({len(combined_html)} bytes)")
        return combined_html

    def extract_content(self, html: str, article: Dict[str, Any]) -> str:
        """Extract Mein-MMO specific content."""
        self.logger.debug(f"[extract_content] Starting for {article.get('identifier')}")
        result = extract_mein_mmo_content(
            html=html, article=article, selectors_to_remove=self.selectors_to_remove, logger=self.logger
        )
        self.logger.debug(f"[extract_content] Completed, result size: {len(result)} bytes")
        return result

    def process_content(self, html: str, article: Dict[str, Any]) -> str:
        """Process Mein-MMO content with header image extraction."""
        self.logger.debug(f"[process_content] Starting for {article.get('identifier')}")

        # Extract header image from original HTML
        header_image_url = None
        try:
            self.logger.debug(f"[process_content] Fetching original page to extract header image")
            # Re-fetch first page to get header image
            first_page_html = super().fetch_article_content(article["identifier"])
            self.logger.debug(f"[process_content] Original page fetched ({len(first_page_html)} bytes)")
            header_image_url = extract_header_image_url(first_page_html, self.logger)
            if header_image_url:
                self.logger.debug(f"[process_content] Header image found: {header_image_url}")
            else:
                self.logger.debug(f"[process_content] No header image found")
        except Exception as e:
            self.logger.warning(f"[process_content] Failed to extract header image: {type(e).__name__}: {e}")

        # Clean HTML
        self.logger.debug(f"[process_content] Cleaning HTML")
        cleaned = clean_html(html)

        # Format with header and footer
        self.logger.debug(f"[process_content] Formatting content with title, author, date, and header image")
        formatted = format_article_content(
            cleaned,
            title=article["name"],
            url=article["identifier"],
            author=article.get("author"),
            date=article.get("date"),
            header_image_url=header_image_url,
        )

        self.logger.info(f"[process_content] Completed, formatted size: {len(formatted)} bytes")
        return formatted
