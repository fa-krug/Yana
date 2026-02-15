"""MacTechNews aggregator implementation."""

import re
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

    @staticmethod
    def _extract_mtn_image_id(url: str) -> str | None:
        """Extract numeric image ID from mactechnews image URLs.

        URLs follow the pattern: Name.{numeric_id}.{ext}
        e.g. Cover-Raumakustik.592736.jpg -> 592736
             Bild.592736.jpg -> 592736
        """
        match = re.search(r"\.(\d{5,})\.\w+$", url)
        return match.group(1) if match else None

    def process_content(self, html: str, article: Dict[str, Any]) -> str:
        """Resolve relative URLs and remove duplicate header images."""
        soup = BeautifulSoup(html, "html.parser")
        base_url = article["identifier"]

        # Remove content images that duplicate the header image.
        # mactechnews uses the same numeric ID across different image variants
        # (e.g. og:image "Cover-Raumakustik.592736.jpg" vs content "Bild.592736.jpg")
        header_data = article.get("header_data")
        if header_data and header_data.image_url:
            header_image_id = self._extract_mtn_image_id(header_data.image_url)
            if header_image_id:
                for img in soup.find_all("img"):
                    src = img.get("src")
                    if (
                        src
                        and not isinstance(src, list)
                        and self._extract_mtn_image_id(src) == header_image_id
                    ):
                        img.decompose()

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
