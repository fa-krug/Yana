"""Base aggregator class for implementing feed providers."""

import asyncio
import logging
from abc import ABC, abstractmethod
from datetime import timedelta
from typing import Any, Dict, List, Optional

from django.utils import timezone

from .services.header_element.context import HeaderElementData


class BaseAggregator(ABC):
    """Base class for all aggregators using Template Method pattern."""

    # The model field name used for identifier input (e.g. "identifier", "reddit_subreddit")
    identifier_field = "identifier"

    # Set to True if the aggregator implements dynamic identifier search
    # (i.e. uses the query parameter in get_identifier_choices)
    supports_identifier_search = False

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

    @classmethod
    def get_identifier_from_related(cls, related_obj: Any) -> str:
        """
        Extract the identifier string from a related model object.
        Default implementation returns str(related_obj).
        """
        return str(related_obj)

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

    def normalize_identifier(self, identifier: str) -> str:
        """
        Normalize an identifier before saving.

        Checks if the identifier matches a label in get_identifier_choices()
        and returns the corresponding value if so. Otherwise returns stripped.

        Args:
            identifier: Raw identifier string

        Returns:
            Normalized identifier string
        """
        normalized = identifier.strip()

        # If the identifier matches a label in our choices, use the value instead
        # We call it with default args since we don't have request context here
        choices = self.get_identifier_choices()
        for value, label in choices:
            if normalized == label:
                return str(value)

        return normalized

    def get_identifier_label(self, identifier: str) -> str:
        """
        Get a nice display label for an identifier.

        Checks get_identifier_choices() for a matching value and returns its label.

        Args:
            identifier: Clean identifier

        Returns:
            Display label string
        """
        choices = self.get_identifier_choices()
        for value, label in choices:
            if str(identifier) == str(value):
                return str(label)

        return identifier

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

        Default implementation filters articles older than 2 months
        and sets their date to now.

        Args:
            articles: List of article dictionaries

        Returns:
            Filtered list of articles
        """
        self.logger.debug("[filter_articles] Starting age check filter")
        cutoff_date = timezone.now() - timedelta(days=60)
        filtered = []

        for article in articles:
            article_date = article.get("date")

            # Ensure article_date is aware for comparison
            if article_date and timezone.is_naive(article_date):
                article_date = timezone.make_aware(article_date)

            if article_date and article_date < cutoff_date:
                self.logger.info(
                    f"[filter_articles] Skipping old article: {article.get('name')} ({article_date})"
                )
                continue

            # Update date to now for accepted articles
            article["date"] = timezone.now()
            filtered.append(article)
        self.logger.info(f"[filter_articles] Kept {len(filtered)}/{len(articles)} articles")
        return filtered

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

    def get_source_url(self) -> str:
        """
        Get the source URL for this feed.

        This is used by the GReader API to return the feed's website/source URL
        to external clients (like NetNewsWire).

        Override this method in subclasses to provide aggregator-specific URLs.
        Default implementation returns the feed identifier.

        Returns:
            Source URL as string, or empty string if not available
        """
        return self.identifier or ""

    @classmethod
    def get_identifier_choices(
        cls, query: Optional[str] = None, user: Optional[Any] = None
    ) -> List[tuple]:
        """
        Get available identifier choices for this aggregator.

        Returns a list of (value, label) tuples for identifier autocomplete.
        Aggregators can override this to provide predefined identifier options.

        Args:
            query: Optional search query string
            user: Optional user object (for authenticated APIs)

        Returns:
            List of (identifier_value, display_label) tuples
            Empty list if no predefined choices available

        Example:
            [
                ("https://www.merkur.de/rssfeed.rdf", "Main Feed"),
                ("https://www.merkur.de/lokales/muenchen/rssfeed.rdf", "München"),
            ]
        """
        return []

    @classmethod
    def get_configuration_fields(cls) -> Dict[str, Any]:
        """
        Get configuration fields for this aggregator.

        Returns a dictionary where keys are field names and values are Django Form fields.
        These fields will be injected into the Feed Admin form.

        Example:
            from django import forms
            return {
                "subreddit_sort": forms.ChoiceField(
                    choices=[("hot", "Hot"), ("new", "New")],
                    initial="hot",
                    label="Sort Order",
                    required=False,
                ),
                "min_score": forms.IntegerField(
                    initial=100,
                    label="Minimum Score",
                    required=False,
                ),
            }
        """
        return {}

    @classmethod
    def get_default_identifier(cls) -> str:
        """
        Get the default identifier for this aggregator.

        Some aggregators set a default identifier in __init__, but that requires
        a feed instance. This class method allows getting the default without
        instantiation, useful for autocomplete pre-population.

        Returns:
            Default identifier string, or empty string if none
        """
        return ""

    def extract_header_element(self, article: Dict[str, Any]) -> Optional[HeaderElementData]:
        """
        Extract header element (image/video converted to image data) for an article.

        Uses the HeaderElementExtractor to attempt to extract a header element
        from the article URL. Returns HeaderElementData or None if extraction fails.

        This method bridges async extraction with the synchronous aggregator pipeline.

        Args:
            article: Article dictionary with 'identifier' and 'name' keys

        Returns:
            HeaderElementData containing raw bytes and base64 URI, or None if extraction fails

        Raises:
            ArticleSkipError: On 4xx HTTP errors (article should be skipped)
        """
        from .exceptions import ArticleSkipError
        from .services.header_element import HeaderElementExtractor

        try:
            url = article.get("identifier")
            alt = article.get("name", "Article image")

            if not url:
                self.logger.warning("extract_header_element: Missing article URL")
                return None

            # Run async extraction using asyncio
            extractor = HeaderElementExtractor()
            header_data = asyncio.run(extractor.extract_header_element(url, alt))

            return header_data

        except ArticleSkipError:
            # Re-raise ArticleSkipError to be handled by caller
            raise
        except Exception as e:
            self.logger.error(f"extract_header_element: Unexpected error - {e}")
            return None

    def fetch_article_content(self, url: str) -> str:
        """
        Fetch HTML content from URL.

        Base implementation returns empty string.
        Override in subclasses (e.g. FullWebsiteAggregator) to fetch actual HTML.
        """
        return ""

    def extract_content(self, html: str, article: Dict[str, Any]) -> str:
        """
        Extract main content from HTML.

        Base implementation returns original HTML.
        Override in subclasses to extract specific elements.
        """
        return html

    def process_content(self, content: str, article: Dict[str, Any]) -> str:
        """
        Process and format content.

        Base implementation returns original content.
        Override in subclasses to clean/format HTML.
        """
        return content

    def collect_feed_icon(self) -> Optional[str]:
        """
        Collect feed icon URL during aggregation.

        Returns:
            Icon URL or None if no icon available
        """
        return None
