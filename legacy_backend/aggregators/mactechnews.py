"""Aggregator for MacTechNews RSS feeds."""

from bs4 import BeautifulSoup
from pydantic import BaseModel, Field

from .base import BaseAggregator, RawArticle


class MacTechNewsAggregatorConfig(BaseModel):
    id: str
    type: str = Field(pattern="^(managed|custom|social)$")
    name: str = Field(min_length=1)
    url: str = ""
    description: str = Field(min_length=1)
    wait_for_selector: str | None = None
    selectors_to_remove: list[str] = Field(default_factory=list)
    options: dict = Field(default_factory=dict)


class MacTechNewsAggregator(BaseAggregator):
    """Aggregator for MacTechNews.de (German Apple news)."""

    id = "mactechnews"
    type = "managed"
    name = "MacTechNews"
    url = "https://www.mactechnews.de/Rss/News.x"
    description = "Specialized aggregator for MacTechNews.de (German Apple news). Extracts article content from MtnArticle elements, removes mobile headers and sidebars."
    wait_for_selector = ".MtnArticle"
    selectors_to_remove = [
        ".NewsPictureMobile",
        "header",
        "aside",
        "script",
        "style",
        "iframe",
        "noscript",
        "svg",
    ]

    def __init__(self):
        super().__init__()
        MacTechNewsAggregatorConfig(
            id=self.id,
            type=self.type,
            name=self.name,
            url=self.url,
            description=self.description,
            wait_for_selector=self.wait_for_selector,
            selectors_to_remove=self.selectors_to_remove,
            options=self.options,
        )

    def extract_content(self, article: RawArticle) -> None:
        """Extract content from .MtnArticle element."""
        try:
            soup = BeautifulSoup(article.html, "html.parser")
            article_content = soup.select_one(".MtnArticle")
            if not article_content:
                self.logger.warning(
                    f"Could not find .MtnArticle content in {article.url}"
                )
                return
            for tag in article_content.find_all(["p", "div", "span"]):
                if not tag.get_text(strip=True) and not tag.find("img"):
                    tag.decompose()
            article.html = str(article_content)
        except Exception as e:
            self.logger.error(
                f"Extraction failed for {article.url}: {e}", exc_info=True
            )


def aggregate(feed, force_refresh=False, options=None):
    aggregator = MacTechNewsAggregator()
    return aggregator.aggregate(feed, force_refresh, options or {})
