"""
Simple aggregator for RSS feeds.

This module provides a simple aggregator that uses the RSS feed content directly
without fetching the full article from the web. It sanitizes the content and
adds a source link.
"""

from pydantic import BaseModel, Field

from .base import BaseAggregator, RawArticle


class SimpleAggregatorConfig(BaseModel):
    id: str
    type: str = Field(pattern="^(managed|custom|social)$")
    name: str = Field(min_length=1)
    url: str = ""
    description: str = Field(min_length=1)
    wait_for_selector: str | None = None
    selectors_to_remove: list[str] = Field(default_factory=list)
    options: dict = Field(default_factory=dict)


class SimpleAggregator(BaseAggregator):
    """
    Lightweight aggregator that uses content directly from the RSS feed.

    Does not fetch full articles from the web - faster but may have incomplete content.
    Best for feeds with full content already included.
    """

    id = "feed_content"
    type = "custom"
    name = "RSS-Only"
    url = ""
    description = "Lightweight aggregator that uses content directly from the RSS feed without fetching full articles. Faster but may have incomplete content. Best for feeds with full content already included."

    def __init__(self):
        super().__init__()
        SimpleAggregatorConfig(
            id=self.id,
            type=self.type,
            name=self.name,
            url=self.url,
            description=self.description,
            wait_for_selector=self.wait_for_selector,
            selectors_to_remove=self.selectors_to_remove,
            options=self.options,
        )

    def fetch_article_html(self, article: RawArticle) -> str:
        """Don't fetch from web - use RSS content directly."""
        return article.content

    def extract_content(self, article: RawArticle) -> None:
        """RSS content is already extracted - nothing to do."""
        pass


def aggregate(feed, force_refresh=False, options=None):
    aggregator = SimpleAggregator()
    return aggregator.aggregate(feed, force_refresh, options or {})
