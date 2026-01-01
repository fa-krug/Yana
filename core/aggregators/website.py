"""Full website aggregator base class."""

from typing import Any, Dict, List

from bs4 import BeautifulSoup

from .exceptions import ArticleSkipError
from .rss import RssAggregator
from .utils import (
    clean_html,
    extract_main_content,
    fetch_html,
    format_article_content,
    remove_image_by_url,
    sanitize_class_names,
)


class FullWebsiteAggregator(RssAggregator):
    """Aggregator that extracts full content from article URLs."""

    # CSS selectors to remove from extracted content
    selectors_to_remove: List[str] = [
        "script",
        "style",
        "iframe",
        "noscript",
        ".advertisement",
        ".ad",
        ".social-share",
    ]

    # Main content selector (override in subclasses)
    content_selector: str = "article, .article-content, .entry-content, main"

    def enrich_articles(self, articles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Fetch and extract full article content with header elements."""
        enriched = []

        for article in articles:
            url = article["identifier"]
            self.logger.info(f"Fetching full content from: {url}")

            try:
                # Extract header element FIRST (may throw ArticleSkipError)
                header_data = self.extract_header_element(article)
                if header_data:
                    article["header_data"] = header_data
                    self.logger.debug(f"Extracted header data for {url}")
                else:
                    self.logger.debug(f"No header element found for {url}")

                # Fetch HTML
                raw_html = self.fetch_article_content(url)

                # Extract content
                content = self.extract_content(raw_html, article)

                # Process content (clean, format)
                processed = self.process_content(content, article)

                # Update article
                article["raw_content"] = raw_html
                article["content"] = processed

                enriched.append(article)

            except ArticleSkipError as e:
                # Skip article on 4xx HTTP errors (e.g., from header extraction)
                self.logger.warning(f"Skipping article {url}: {e}")

            except Exception as e:
                self.logger.error(f"Failed to fetch article {url}: {e}")
                # Keep original RSS content without header element
                enriched.append(article)

        return enriched

    def fetch_article_content(self, url: str) -> str:
        """Fetch HTML content from URL."""
        return fetch_html(url, timeout=30)

    def extract_content(self, html: str, article: Dict[str, Any]) -> str:
        """Extract main content from HTML."""
        return extract_main_content(
            html, selector=self.content_selector, remove_selectors=self.selectors_to_remove
        )

    def process_content(self, html: str, article: Dict[str, Any]) -> str:
        """Process and format content."""
        # Parse HTML
        soup = BeautifulSoup(html, "html.parser")

        # Remove header image from content if it was extracted
        header_data = article.get("header_data")
        if header_data and header_data.image_url:
            self.logger.debug(f"Removing header image from content: {header_data.image_url}")
            remove_image_by_url(soup, header_data.image_url)

        # Sanitize class names
        sanitize_class_names(soup)

        # Clean HTML
        cleaned = clean_html(str(soup))

        # Format with header and footer
        formatted = format_article_content(
            cleaned,
            title=article["name"],
            url=article["identifier"],
            author=article.get("author"),
            date=article.get("date"),
        )

        # Prepend header image if available
        if header_data:
            header_html = (
                f'<p style="margin-bottom: 1.5em; text-align: center;">'
                f'<img src="{header_data.base64_data_uri}" '
                f'alt="Article header" '
                f'style="max-width: 100%; height: auto; border-radius: 8px;">'
                f"</p>"
            )
            formatted = header_html + formatted

        return formatted
