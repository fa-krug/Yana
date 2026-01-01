"""
Dummy aggregator implementations for all feed types.
"""
from typing import List, Dict, Any
from .base import BaseAggregator


class FullWebsiteAggregator(BaseAggregator):
    """Aggregator for full website scraping."""

    def aggregate(self) -> List[Dict[str, Any]]:
        print(f"[FullWebsiteAggregator] Triggered for feed '{self.feed.name}' (ID: {self.feed.id})")
        print(f"  - Identifier: {self.identifier}")
        print(f"  - Daily limit: {self.daily_limit}")
        return []


class FeedContentAggregator(BaseAggregator):
    """Aggregator for RSS/Atom feeds."""

    def aggregate(self) -> List[Dict[str, Any]]:
        print(f"[FeedContentAggregator] Triggered for feed '{self.feed.name}' (ID: {self.feed.id})")
        print(f"  - Identifier: {self.identifier}")
        print(f"  - Daily limit: {self.daily_limit}")
        return []


class HeiseAggregator(BaseAggregator):
    """Aggregator for Heise."""

    def aggregate(self) -> List[Dict[str, Any]]:
        print(f"[HeiseAggregator] Triggered for feed '{self.feed.name}' (ID: {self.feed.id})")
        print(f"  - Identifier: {self.identifier}")
        print(f"  - Daily limit: {self.daily_limit}")
        return []


class MerkurAggregator(BaseAggregator):
    """Aggregator for Merkur."""

    def aggregate(self) -> List[Dict[str, Any]]:
        print(f"[MerkurAggregator] Triggered for feed '{self.feed.name}' (ID: {self.feed.id})")
        print(f"  - Identifier: {self.identifier}")
        print(f"  - Daily limit: {self.daily_limit}")
        return []


class TagesschauAggregator(BaseAggregator):
    """Aggregator for Tagesschau."""

    def aggregate(self) -> List[Dict[str, Any]]:
        print(f"[TagesschauAggregator] Triggered for feed '{self.feed.name}' (ID: {self.feed.id})")
        print(f"  - Identifier: {self.identifier}")
        print(f"  - Daily limit: {self.daily_limit}")
        return []


class ExplosmAggregator(BaseAggregator):
    """Aggregator for Explosm."""

    def aggregate(self) -> List[Dict[str, Any]]:
        print(f"[ExplosmAggregator] Triggered for feed '{self.feed.name}' (ID: {self.feed.id})")
        print(f"  - Identifier: {self.identifier}")
        print(f"  - Daily limit: {self.daily_limit}")
        return []


class DarkLegacyAggregator(BaseAggregator):
    """Aggregator for Dark Legacy Comics."""

    def aggregate(self) -> List[Dict[str, Any]]:
        print(f"[DarkLegacyAggregator] Triggered for feed '{self.feed.name}' (ID: {self.feed.id})")
        print(f"  - Identifier: {self.identifier}")
        print(f"  - Daily limit: {self.daily_limit}")
        return []


class CaschysBlogAggregator(BaseAggregator):
    """Aggregator for Caschy's Blog."""

    def aggregate(self) -> List[Dict[str, Any]]:
        print(f"[CaschysBlogAggregator] Triggered for feed '{self.feed.name}' (ID: {self.feed.id})")
        print(f"  - Identifier: {self.identifier}")
        print(f"  - Daily limit: {self.daily_limit}")
        return []


class MactechnewsAggregator(BaseAggregator):
    """Aggregator for MacTechNews."""

    def aggregate(self) -> List[Dict[str, Any]]:
        print(f"[MactechnewsAggregator] Triggered for feed '{self.feed.name}' (ID: {self.feed.id})")
        print(f"  - Identifier: {self.identifier}")
        print(f"  - Daily limit: {self.daily_limit}")
        return []


class OglafAggregator(BaseAggregator):
    """Aggregator for Oglaf."""

    def aggregate(self) -> List[Dict[str, Any]]:
        print(f"[OglafAggregator] Triggered for feed '{self.feed.name}' (ID: {self.feed.id})")
        print(f"  - Identifier: {self.identifier}")
        print(f"  - Daily limit: {self.daily_limit}")
        return []


class MeinMmoAggregator(BaseAggregator):
    """Aggregator for Mein-MMO."""

    def aggregate(self) -> List[Dict[str, Any]]:
        print(f"[MeinMmoAggregator] Triggered for feed '{self.feed.name}' (ID: {self.feed.id})")
        print(f"  - Identifier: {self.identifier}")
        print(f"  - Daily limit: {self.daily_limit}")
        return []


class YoutubeAggregator(BaseAggregator):
    """Aggregator for YouTube."""

    def aggregate(self) -> List[Dict[str, Any]]:
        print(f"[YoutubeAggregator] Triggered for feed '{self.feed.name}' (ID: {self.feed.id})")
        print(f"  - Identifier: {self.identifier}")
        print(f"  - Daily limit: {self.daily_limit}")
        return []


class RedditAggregator(BaseAggregator):
    """Aggregator for Reddit."""

    def aggregate(self) -> List[Dict[str, Any]]:
        print(f"[RedditAggregator] Triggered for feed '{self.feed.name}' (ID: {self.feed.id})")
        print(f"  - Identifier: {self.identifier}")
        print(f"  - Daily limit: {self.daily_limit}")
        return []


class PodcastAggregator(BaseAggregator):
    """Aggregator for Podcasts."""

    def aggregate(self) -> List[Dict[str, Any]]:
        print(f"[PodcastAggregator] Triggered for feed '{self.feed.name}' (ID: {self.feed.id})")
        print(f"  - Identifier: {self.identifier}")
        print(f"  - Daily limit: {self.daily_limit}")
        return []
