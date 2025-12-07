"""Aggregator for Merkur RSS feeds."""

from bs4 import BeautifulSoup
from pydantic import BaseModel, Field

from .base import BaseAggregator, RawArticle


class MerkurAggregatorConfig(BaseModel):
    id: str
    type: str = Field(pattern="^(managed|custom|social)$")
    name: str = Field(min_length=1)
    url: str = ""
    description: str = Field(min_length=1)
    wait_for_selector: str | None = None
    selectors_to_remove: list[str] = Field(default_factory=list)
    options: dict = Field(default_factory=dict)


class MerkurAggregator(BaseAggregator):
    """Aggregator for Merkur.de (German news)."""

    id = "merkur"
    type = "managed"
    name = "Merkur"
    url = "https://www.merkur.de/rssfeed.rdf"
    description = "Specialized aggregator for Merkur.de (German news). Extracts article content from idjs-Story elements and removes tracking and recommendation elements."
    identifier_type = "url"
    identifier_label = "Feed Selection"
    identifier_description = "Select the Merkur feed to aggregate"
    identifier_placeholder = ""
    identifier_editable = True
    identifier_choices = [
        ("https://www.merkur.de/rssfeed.rdf", "Main Feed"),
        (
            "https://www.merkur.de/lokales/garmisch-partenkirchen/rssfeed.rdf",
            "Garmisch-Partenkirchen",
        ),
        ("https://www.merkur.de/lokales/wuermtal/rssfeed.rdf", "Würmtal"),
        (
            "https://www.merkur.de/lokales/starnberg/rssfeed.rdf",
            "Starnberg",
        ),
        (
            "https://www.merkur.de/lokales/fuerstenfeldbruck/rssfeed.rdf",
            "Fürstenfeldbruck",
        ),
        ("https://www.merkur.de/lokales/dachau/rssfeed.rdf", "Dachau"),
        ("https://www.merkur.de/lokales/freising/rssfeed.rdf", "Freising"),
        ("https://www.merkur.de/lokales/erding/rssfeed.rdf", "Erding"),
        (
            "https://www.merkur.de/lokales/ebersberg/rssfeed.rdf",
            "Ebersberg",
        ),
        ("https://www.merkur.de/lokales/muenchen/rssfeed.rdf", "München"),
        (
            "https://www.merkur.de/lokales/muenchen-lk/rssfeed.rdf",
            "München Landkreis",
        ),
        (
            "https://www.merkur.de/lokales/holzkirchen/rssfeed.rdf",
            "Holzkirchen",
        ),
        ("https://www.merkur.de/lokales/miesbach/rssfeed.rdf", "Miesbach"),
        (
            "https://www.merkur.de/lokales/region-tegernsee/rssfeed.rdf",
            "Region Tegernsee",
        ),
        ("https://www.merkur.de/lokales/bad-toelz/rssfeed.rdf", "Bad Tölz"),
        (
            "https://www.merkur.de/lokales/wolfratshausen/rssfeed.rdf",
            "Wolfratshausen",
        ),
        ("https://www.merkur.de/lokales/weilheim/rssfeed.rdf", "Weilheim"),
        ("https://www.merkur.de/lokales/schongau/rssfeed.rdf", "Schongau"),
    ]

    wait_for_selector = ".idjs-Story"

    selectors_to_remove = [
        ".id-DonaldBreadcrumb--default",
        ".id-StoryElement-headline",
        ".lp_west_printAction",
        ".lp_west_webshareAction",
        ".id-Recommendation",
        ".enclosure",
        ".id-Story-timestamp",
        ".id-Story-authors",
        ".id-Story-interactionBar",
        ".id-Comments",
        ".id-ClsPrevention",
        "egy-discussion",
        "figcaption",
        "script",
        "style",
        "iframe",
        "noscript",
        "svg",
        ".id-StoryElement-intestitialLink",
        ".id-StoryElement-embed--fanq",
    ]

    def __init__(self):
        super().__init__()
        MerkurAggregatorConfig(
            id=self.id,
            type=self.type,
            name=self.name,
            url=self.url,
            description=self.description,
            wait_for_selector=self.wait_for_selector,
            selectors_to_remove=self.selectors_to_remove,
            options=self.options,
        )

    def fetch_rss_feed(self, feed_identifier: str):
        """
        Override to use feed identifier directly.

        Args:
            feed_identifier: The feed identifier (from feed.identifier)

        Returns:
            Parsed feed object (feedparser.FeedParserDict)
        """
        self.logger.info(f"Using feed: {feed_identifier}")
        return super().fetch_rss_feed(feed_identifier)

    def extract_content(self, article: RawArticle) -> None:
        """Extract content from .idjs-Story element."""
        try:
            soup = BeautifulSoup(article.html, "html.parser")
            story = soup.select_one(".idjs-Story")
            if not story:
                self.logger.warning(
                    f"Could not find .idjs-Story content in {article.url}"
                )
                return
            content = BeautifulSoup(str(story), "html.parser")

            # Remove all data-sanitized-* attributes
            for tag in content.find_all(True):
                attrs_to_remove = [
                    key for key in tag.attrs if key.startswith("data-sanitized-")
                ]
                for attr in attrs_to_remove:
                    del tag.attrs[attr]

            # Remove empty tags
            for tag in content.find_all(["p", "div", "span"]):
                if not tag.get_text(strip=True) and not tag.find("img"):
                    tag.decompose()

            article.html = str(content)
        except Exception as e:
            self.logger.error(
                f"Extraction failed for {article.url}: {e}", exc_info=True
            )


def aggregate(feed, force_refresh=False, options=None):
    aggregator = MerkurAggregator()
    return aggregator.aggregate(feed, force_refresh, options or {})
