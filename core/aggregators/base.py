"""
Base aggregator class.
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any


class BaseAggregator(ABC):
    """Base class for all aggregators."""

    def __init__(self, feed):
        """
        Initialize aggregator with a feed.

        Args:
            feed: Feed model instance
        """
        self.feed = feed
        self.identifier = feed.identifier
        self.daily_limit = feed.daily_limit

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

    def get_aggregator_type(self) -> str:
        """Get the aggregator type name."""
        return self.__class__.__name__.replace('Aggregator', '').lower()
