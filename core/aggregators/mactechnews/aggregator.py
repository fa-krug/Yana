"""MacTechNews aggregator implementation."""

from typing import Any, Dict
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from ..website import FullWebsiteAggregator


class MactechnewsAggregator(FullWebsiteAggregator):
    """Aggregator for MacTechNews (mactechnews.de)."""

    def __init__(self, feed):
        super().__init__(feed)
        # Force full content extraction
        self.feed.options["use_full_content"] = True

        if not self.identifier or self.identifier == "":
            self.identifier = "https://www.mactechnews.de/Rss/News.x"

    def get_source_url(self) -> str:
        return "https://www.mactechnews.de"

    @classmethod
    def get_configuration_fields(cls) -> Dict[str, Any]:
        """Remove configuration options for this managed aggregator."""
        return {}

    # Main content container
    content_selector = ".MtnArticle"

    # Selectors to strip
    selectors_to_remove = [
        ".NewsPictureMobile",
        "aside",
        "script",
        "style",
        "iframe",
        "noscript",
        "svg",
        "header",  # Remove article header (title, meta) to avoid duplication
        ".TexticonBox.Right",  # Remove sidebars/summary boxes inside content
    ]

    def process_content(self, html: str, article: Dict[str, Any]) -> str:
        """Resolve relative URLs in content."""
        soup = BeautifulSoup(html, "html.parser")
        base_url = article["identifier"]

        # Resolve relative URLs for images
        for img in soup.find_all("img"):
            src = img.get("src")
            if (
                src
                and not isinstance(src, list)
                and not src.startswith(("http://", "https://", "data:"))
            ):
                img["src"] = urljoin(base_url, str(src))

        # Resolve relative URLs for links
        for a in soup.find_all("a"):
            href = a.get("href")
            if (
                href
                and not isinstance(href, list)
                and not href.startswith(("http://", "https://", "mailto:", "tel:", "#"))
            ):
                a["href"] = urljoin(base_url, str(href))

        return super().process_content(str(soup), article)
