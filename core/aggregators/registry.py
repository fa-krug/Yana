"""
Aggregator registry to map feed types to aggregator classes.
"""

from typing import Dict, Type

from .base import BaseAggregator
from .implementations import (
    CaschysBlogAggregator,
    DarkLegacyAggregator,
    ExplosmAggregator,
    FeedContentAggregator,
    HeiseAggregator,
    MactechnewsAggregator,
    MerkurAggregator,
    OglafAggregator,
    PodcastAggregator,
    RedditAggregator,
    TagesschauAggregator,
    YoutubeAggregator,
)
from .mein_mmo import MeinMmoAggregator
from .website import FullWebsiteAggregator


class AggregatorRegistry:
    """Registry for aggregator classes."""

    _registry: Dict[str, Type[BaseAggregator]] = {
        "full_website": FullWebsiteAggregator,
        "feed_content": FeedContentAggregator,
        "heise": HeiseAggregator,
        "merkur": MerkurAggregator,
        "tagesschau": TagesschauAggregator,
        "explosm": ExplosmAggregator,
        "dark_legacy": DarkLegacyAggregator,
        "caschys_blog": CaschysBlogAggregator,
        "mactechnews": MactechnewsAggregator,
        "oglaf": OglafAggregator,
        "mein_mmo": MeinMmoAggregator,
        "youtube": YoutubeAggregator,
        "reddit": RedditAggregator,
        "podcast": PodcastAggregator,
    }

    @classmethod
    def get(cls, aggregator_type: str) -> Type[BaseAggregator]:
        """
        Get aggregator class for the given type.

        Args:
            aggregator_type: The aggregator type string (e.g., 'full_website')

        Returns:
            Aggregator class

        Raises:
            KeyError: If aggregator type is not found
        """
        if aggregator_type not in cls._registry:
            raise KeyError(f"Unknown aggregator type: {aggregator_type}")
        return cls._registry[aggregator_type]

    @classmethod
    def get_all(cls) -> Dict[str, Type[BaseAggregator]]:
        """Get all registered aggregators."""
        return cls._registry.copy()


def get_aggregator(feed) -> BaseAggregator:
    """
    Get aggregator instance for a feed.

    Args:
        feed: Feed model instance

    Returns:
        Instantiated aggregator
    """
    aggregator_class = AggregatorRegistry.get(feed.aggregator)
    return aggregator_class(feed)
