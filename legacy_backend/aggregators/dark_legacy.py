"""Aggregator for Dark Legacy Comics RSS feed."""

from bs4 import BeautifulSoup
from pydantic import BaseModel, Field

from .base import BaseAggregator, RawArticle


class DarkLegacyAggregatorConfig(BaseModel):
    id: str
    type: str = Field(pattern="^(managed|custom|social)$")
    name: str = Field(min_length=1)
    url: str = ""
    description: str = Field(min_length=1)
    wait_for_selector: str | None = None
    selectors_to_remove: list[str] = Field(default_factory=list)
    options: dict = Field(default_factory=dict)


class DarkLegacyAggregator(BaseAggregator):
    """Webcomic featuring humor about World of Warcraft and gaming culture."""

    id = "dark_legacy"
    type = "managed"
    name = "Dark Legacy Comics"
    url = "https://darklegacycomics.com/feed.xml"
    description = "Webcomic featuring humor about World of Warcraft and gaming culture."
    wait_for_selector = "#gallery"
    selectors_to_remove = ["script", "style", "iframe", "noscript"]

    def __init__(self):
        super().__init__()
        DarkLegacyAggregatorConfig(
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
        """Extract comic images from #gallery element."""
        try:
            soup = BeautifulSoup(article.html, "html.parser")
            gallery = soup.select_one("#gallery")
            if not gallery:
                self.logger.warning(f"Could not find #gallery element in {article.url}")
                return
            content = BeautifulSoup("<div></div>", "html.parser").div
            for img in gallery.find_all("img"):
                new_img = soup.new_tag("img")
                img_src = img.get("src") or img.get("data-src")
                if img_src:
                    new_img["src"] = img_src
                if img.get("alt"):
                    new_img["alt"] = img.get("alt")
                content.append(new_img)
            if not content.find_all("img"):
                content = gallery
            article.html = str(content)
        except Exception as e:
            self.logger.error(
                f"Extraction failed for {article.url}: {e}", exc_info=True
            )


def aggregate(feed, force_refresh=False, options=None):
    aggregator = DarkLegacyAggregator()
    return aggregator.aggregate(feed, force_refresh, options or {})
