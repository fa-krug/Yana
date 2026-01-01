"""Full website aggregator base class."""

from typing import Any, Dict, List
from bs4 import BeautifulSoup

from .rss import RssAggregator
from .exceptions import ArticleSkipError
from .utils import (
    fetch_html,
    extract_main_content,
    clean_html,
    sanitize_class_names,
    format_article_content,
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
                header_element = self.extract_header_element(article)
                if header_element:
                    article["icon"] = header_element
                    self.logger.debug(f"Extracted header element for {url}")
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

        return formatted
