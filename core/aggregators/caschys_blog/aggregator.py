from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from ..website import FullWebsiteAggregator


class CaschysBlogAggregator(FullWebsiteAggregator):
    """Aggregator for Caschy's Blog (stadt-bremerhaven.de)."""

    def __init__(self, feed):
        super().__init__(feed)
        if not self.identifier or self.identifier == "":
            self.identifier = "https://stadt-bremerhaven.de/feed/"

    def get_source_url(self) -> str:
        return "https://stadt-bremerhaven.de"

    @classmethod
    def get_identifier_choices(
        cls, query: Optional[str] = None, user: Optional[Any] = None
    ) -> List[Tuple[str, str]]:
        return [
            ("https://stadt-bremerhaven.de/feed/", "Caschy's Blog (Main Feed)"),
        ]

    @classmethod
    def get_default_identifier(cls) -> str:
        return "https://stadt-bremerhaven.de/feed/"

    # Main content container
    content_selector = ".entry-inner"

    # Selectors to strip
    selectors_to_remove = [
        ".aawp",
        ".aawp-disclaimer",
        "script",
        "style",
        "iframe",
        "noscript",
        "svg",
    ]

    def filter_articles(self, articles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Skip articles marked as advertisements."""
        # First use base filtering (age check)
        filtered = super().filter_articles(articles)

        # Then filter out advertisements
        result = []
        for article in filtered:
            if "(Anzeige)" in article.get("name", ""):
                self.logger.info(f"Skipping advertisement article: {article.get('name')}")
                continue
            result.append(article)

        return result

    def process_content(self, html: str, article: Dict[str, Any]) -> str:
        """Resolve relative URLs in content."""
        soup = BeautifulSoup(html, "html.parser")
        base_url = article["identifier"]

        # Resolve relative URLs for images
        for img in soup.find_all("img"):
            src = img.get("src")
            if src and not isinstance(src, list) and not src.startswith(("http://", "https://", "data:")):
                img["src"] = urljoin(base_url, str(src))

        # Resolve relative URLs for links
        for a in soup.find_all("a"):
            href = a.get("href")
            if href and not isinstance(href, list) and not href.startswith(("http://", "https://", "mailto:", "tel:", "#")):
                a["href"] = urljoin(base_url, str(href))

        return super().process_content(str(soup), article)
