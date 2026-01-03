"""Dark Legacy Comics aggregator implementation."""

from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

from ..utils import get_attr_str
from ..website import FullWebsiteAggregator


class DarkLegacyAggregator(FullWebsiteAggregator):
    """Aggregator for Dark Legacy Comics."""

    def __init__(self, feed):
        super().__init__(feed)
        if not self.identifier or self.identifier == "":
            self.identifier = "https://darklegacycomics.com/feed.xml"

    def get_source_url(self) -> str:
        return "https://darklegacycomics.com"

    @classmethod
    def get_identifier_choices(
        cls, query: Optional[str] = None, user: Optional[Any] = None
    ) -> List[Tuple[str, str]]:
        return [
            ("https://darklegacycomics.com/feed.xml", "Dark Legacy Comics (Main Feed)"),
        ]

    @classmethod
    def get_default_identifier(cls) -> str:
        return "https://darklegacycomics.com/feed.xml"

    # Main comic container
    content_selector = "#gallery"

    # Selectors to strip
    selectors_to_remove = [
        "script",
        "style",
        "iframe",
        "noscript",
    ]

    def extract_header_element(self, article: Dict[str, Any]) -> Optional[Any]:
        """Disable header element extraction as the comic is the main content."""
        return None

    def process_content(self, html: str, article: Dict[str, Any]) -> str:
        """Specialized processing to ensure images have absolute URLs."""
        soup = BeautifulSoup(html, "html.parser")
        base_url = article["identifier"]

        # Resolve relative URLs for images
        for img in soup.find_all("img"):
            src = get_attr_str(img, "src")
            if src and not src.startswith(("http://", "https://", "data:")):
                img["src"] = urljoin(base_url, src)

        # We want to keep the images in a clean container
        images = soup.find_all("img")
        if images:
            new_soup = BeautifulSoup("<div></div>", "html.parser")
            div = new_soup.div
            if isinstance(div, Tag):
                for img in images:
                    # Clean up the image tag
                    img_src = get_attr_str(img, "src")
                    new_img = new_soup.new_tag("img", src=img_src)
                    img_alt = get_attr_str(img, "alt")
                    if img_alt:
                        new_img["alt"] = img_alt
                    div.append(new_img)
                html = str(new_soup)

        return super().process_content(html, article)
