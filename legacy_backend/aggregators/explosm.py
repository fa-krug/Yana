"""Aggregator for Explosm (Cyanide & Happiness) RSS feed."""

from bs4 import BeautifulSoup
from pydantic import BaseModel, Field

from .base import BaseAggregator, RawArticle


class ExplosemAggregatorConfig(BaseModel):
    id: str
    type: str = Field(pattern="^(managed|custom|social)$")
    name: str = Field(min_length=1)
    url: str = ""
    description: str = Field(min_length=1)
    wait_for_selector: str | None = None
    selectors_to_remove: list[str] = Field(default_factory=list)
    options: dict = Field(default_factory=dict)


class ExplosemAggregator(BaseAggregator):
    """Daily webcomic featuring dark humor and stick figure comedy."""

    id = "explosm"
    type = "managed"
    name = "Cyanide & Happiness"
    url = "https://explosm.net/rss.xml"
    description = "Daily webcomic featuring dark humor and stick figure comedy from Explosm Entertainment."
    wait_for_selector = "#comic"
    selectors_to_remove = [
        'div[class*="MainComic__LinkContainer"]',
        'div[class*="MainComic__MetaContainer"]',
        'img[loading~="lazy"]',
        "aside",
        "script",
        "style",
        "iframe",
    ]

    def __init__(self):
        super().__init__()
        ExplosemAggregatorConfig(
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
        """Extract only the main comic image from #comic element."""
        try:
            soup = BeautifulSoup(article.html, "html.parser")
            comic = soup.select_one("#comic")
            if not comic:
                self.logger.warning(f"Could not find #comic element in {article.url}")
                return
            content = BeautifulSoup("<div></div>", "html.parser").div
            for img in comic.find_all("img"):
                if img.find_parent("noscript"):
                    continue
                img_src = img.get("src") or img.get("data-src")
                if not img_src or img_src.startswith("data:"):
                    continue
                if not (
                    img_src.startswith("http://") or img_src.startswith("https://")
                ):
                    continue
                new_img = soup.new_tag("img")
                new_img["src"] = img_src
                if img.get("alt"):
                    new_img["alt"] = img.get("alt")
                content.append(new_img)
                break
            if not content.find_all("img"):
                self.logger.warning(f"No valid comic image found in {article.url}")
                content = comic
            article.html = str(content)
        except Exception as e:
            self.logger.error(
                f"Extraction failed for {article.url}: {e}", exc_info=True
            )


def aggregate(feed, force_refresh=False, options=None):
    aggregator = ExplosemAggregator()
    return aggregator.aggregate(feed, force_refresh, options or {})
