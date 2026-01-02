"""Tagesschau aggregator implementation."""

import logging
from typing import Any, Dict, List, Optional, Tuple

from ..website import FullWebsiteAggregator
from .content_extraction import extract_tagesschau_content
from .media_processor import extract_media_header

logger = logging.getLogger(__name__)


class TagesschauAggregator(FullWebsiteAggregator):
    """
    Specialized aggregator for Tagesschau.de.

    Extracts article content using textabsatz paragraphs, handles media headers,
    and filters out specific types of content (livestreams, podcasts).
    """

    # Selectors to remove (in addition to those in FullWebsiteAggregator)
    selectors_to_remove = FullWebsiteAggregator.selectors_to_remove + [
        "div.teaser",
        "div.socialbuttons",
        "aside",
        "nav",
        "button",
        "div.bigfive",
        "div.metatextline",
        "noscript",
        "svg",
    ]

    def get_source_url(self) -> str:
        return "https://www.tagesschau.de"

    @classmethod
    def get_identifier_choices(
        cls, query: Optional[str] = None, user: Optional[Any] = None
    ) -> List[Tuple[str, str]]:
        """Get available Tagesschau RSS feed choices."""
        return [
            ("https://www.tagesschau.de/xml/rss2/", "Main Feed"),
            ("https://www.tagesschau.de/xml/rss2_https.xml", "Main Feed (HTTPS)"),
        ]

    @classmethod
    def get_default_identifier(cls) -> str:
        """Get default Tagesschau identifier."""
        return "https://www.tagesschau.de/xml/rss2/"

    def filter_articles(self, articles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Filter out livestreams, podcasts, and other unwanted content."""
        # First use base filtering (age check)
        articles = super().filter_articles(articles)

        filtered = []
        for article in articles:
            if self._should_skip_article(article):
                continue
            filtered.append(article)

        return filtered

    def _should_skip_article(self, article: Dict[str, Any]) -> bool:
        """Check if article should be skipped based on title or URL."""
        title = article.get("name", "")
        url = article.get("identifier", "")

        # Skip livestreams
        if "Livestream:" in title:
            self.logger.info(f"Skipping livestream article: {title}")
            return True

        # Check title filters
        skip_terms = [
            "tagesschau",
            "tagesthemen",
            "11KM-Podcast",
            "Podcast 15 Minuten",
            "15 Minuten:",
        ]

        if any(term in title for term in skip_terms):
            self.logger.info(f"Skipping filtered content by title: {title}")
            return True

        # Check URL filters
        if "bilder/blickpunkte" in url:
            self.logger.info(f"Skipping image gallery: {url}")
            return True

        return False

    def extract_content(self, html: str, article: Dict[str, Any]) -> str:
        """Extract content using specialized Tagesschau logic."""
        # The base FullWebsiteAggregator.enrich_articles calls extract_content
        # We use our specialized textabsatz extraction
        return extract_tagesschau_content(html)

    def process_content(self, html: str, article: Dict[str, Any]) -> str:
        """Process content and add media header if available."""
        # Get original HTML from article (stored in enrich_articles)
        raw_html = article.get("raw_content", "")

        media_header = None
        if raw_html:
            try:
                media_header = extract_media_header(raw_html)
            except Exception as e:
                self.logger.debug(
                    f"Failed to extract media header for {article.get('identifier')}: {e}"
                )

        # Use base process_content for standard cleaning and formatting
        # If we have a media_header, we temporarily remove header_data from the article
        # so super().process_content() doesn't add a duplicate (and less specific) header image.
        header_data = article.get("header_data")
        if media_header and header_data:
            article["header_data"] = None

        try:
            processed = super().process_content(html, article)
        finally:
            # Restore header_data
            if media_header and header_data:
                article["header_data"] = header_data

        if media_header:
            return media_header + processed

        return processed
