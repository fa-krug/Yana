"""
Base aggregator class.
"""

import logging
import asyncio
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional


class BaseAggregator(ABC):
    """Base class for all aggregators using Template Method pattern."""

    def __init__(self, feed):
        """
        Initialize aggregator with a feed.

        Args:
            feed: Feed model instance
        """
        self.feed = feed
        self.identifier = feed.identifier
        self.daily_limit = feed.daily_limit
        self.logger = logging.getLogger(f"aggregator.{self.get_aggregator_type()}")

    @abstractmethod
    def aggregate(self) -> List[Dict[str, Any]]:
        """
        Fetch and aggregate articles from the feed.

        Returns:
            List of article dictionaries with keys:
                - name: Article title
                - identifier: URL or external ID
                - raw_content: Raw HTML content
                - content: Processed content
                - date: Publication date
                - author: Article author (optional)
                - icon: Article icon URL (optional)
        """
        pass

    def validate(self) -> None:
        """
        Validate feed configuration.

        Override for custom validation.
        Raises ValueError if validation fails.
        """
        if not self.identifier:
            raise ValueError("Feed identifier is required")

    @abstractmethod
    def fetch_source_data(self, limit: Optional[int] = None) -> Any:
        """
        Fetch raw source data (RSS feed, API, etc.).

        Must be implemented by subclasses.

        Args:
            limit: Optional limit on number of items to fetch

        Returns:
            Raw source data in implementation-specific format
        """
        pass

    @abstractmethod
    def parse_to_raw_articles(self, source_data: Any) -> List[Dict[str, Any]]:
        """
        Parse source data to raw article dictionaries.

        Must be implemented by subclasses.

        Args:
            source_data: Raw source data from fetch_source_data()

        Returns:
            List of article dictionaries with basic fields populated
        """
        pass

    def filter_articles(self, articles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Filter articles based on criteria.

        Override for custom filtering.

        Args:
            articles: List of article dictionaries

        Returns:
            Filtered list of articles
        """
        return articles

    def enrich_articles(self, articles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Enrich articles with additional data (full content, images, etc.).

        Override for custom enrichment.

        Args:
            articles: List of article dictionaries

        Returns:
            Enriched list of articles
        """
        return articles

    def finalize_articles(self, articles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Final processing before returning articles.

        Override for custom finalization.

        Args:
            articles: List of article dictionaries

        Returns:
            Finalized list of articles
        """
        return articles

    def get_aggregator_type(self) -> str:
        """Get the aggregator type name."""
        return self.__class__.__name__.replace("Aggregator", "").lower()

    def extract_header_element(self, article: Dict[str, Any]) -> Optional[str]:
        """
        Extract header element (HTML iframe or base64 image) for an article.

        Uses the HeaderElementExtractor to attempt to extract a header element
        from the article URL. Returns HTML string or None if extraction fails.

        This method bridges async extraction with the synchronous aggregator pipeline.

        Args:
            article: Article dictionary with 'identifier' and 'name' keys

        Returns:
            HTML string containing header element (iframe or img) or None if extraction fails

        Raises:
            ArticleSkipError: On 4xx HTTP errors (article should be skipped)
        """
        from .services.header_element import HeaderElementExtractor
        from .exceptions import ArticleSkipError

        try:
            url = article.get("identifier")
            alt = article.get("name", "Article image")

            if not url:
                self.logger.warning("extract_header_element: Missing article URL")
                return None

            # Run async extraction using asyncio
            extractor = HeaderElementExtractor()
            header_element = asyncio.run(extractor.extract_header_element(url, alt))

            return header_element

        except ArticleSkipError:
            # Re-raise ArticleSkipError to be handled by caller
            raise
        except Exception as e:
            self.logger.error(f"extract_header_element: Unexpected error - {e}")
            return None
