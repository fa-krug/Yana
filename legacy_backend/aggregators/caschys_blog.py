"""Aggregator for Caschys Blog RSS feeds."""

from bs4 import BeautifulSoup
from pydantic import BaseModel, Field

from .base import BaseAggregator, RawArticle


class CaschysBlogAggregatorConfig(BaseModel):
    id: str
    type: str = Field(pattern="^(managed|custom|social)$")
    name: str = Field(min_length=1)
    url: str = ""
    description: str = Field(min_length=1)
    wait_for_selector: str | None = None
    selectors_to_remove: list[str] = Field(default_factory=list)
    options: dict = Field(default_factory=dict)


class CaschysBlogAggregator(BaseAggregator):
    """Aggregator for Caschys Blog (German tech blog)."""

    id = "caschys_blog"
    type = "managed"
    name = "Caschys Blog"
    url = "https://stadt-bremerhaven.de/feed/"
    description = "Specialized aggregator for Caschys Blog (German tech blog). Extracts article content from entry-inner elements and removes Amazon affiliate widgets."
    wait_for_selector = ".entry-inner"
    selectors_to_remove = [
        ".aawp",
        ".aawp-disclaimer",
        "script",
        "style",
        "iframe",
        "noscript",
        "svg",
    ]
    identifier_editable = False

    def __init__(self):
        super().__init__()
        CaschysBlogAggregatorConfig(
            id=self.id,
            type=self.type,
            name=self.name,
            url=self.url,
            description=self.description,
            wait_for_selector=self.wait_for_selector,
            selectors_to_remove=self.selectors_to_remove,
            options=self.options,
        )

    def should_skip_article(self, article: RawArticle) -> tuple[bool, str | None]:
        """Skip articles marked as advertisements (Anzeige)."""
        if "(Anzeige)" in article.title:
            return True, f"Skipping advertisement: {article.title}"
        return super().should_skip_article(article)

    def extract_content(self, article: RawArticle) -> None:
        """Extract content from .entry-inner element."""
        try:
            soup = BeautifulSoup(article.html, "html.parser")
            content_element = soup.select_one(".entry-inner")
            if not content_element:
                self.logger.warning(
                    f"Could not find .entry-inner content in {article.url}"
                )
                return
            article.html = str(content_element)
        except Exception as e:
            self.logger.error(
                f"Extraction failed for {article.url}: {e}", exc_info=True
            )


def aggregate(feed, force_refresh=False, options=None):
    aggregator = CaschysBlogAggregator()
    return aggregator.aggregate(feed, force_refresh, options or {})
