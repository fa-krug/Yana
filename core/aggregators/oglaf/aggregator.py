import base64
import logging
from typing import Any, Dict, Optional

from bs4 import BeautifulSoup, Tag

from ..services.image_extraction.fetcher import fetch_single_image
from ..utils import format_article_content, get_attr_str
from ..website import FullWebsiteAggregator

logger = logging.getLogger(__name__)


class OglafAggregator(FullWebsiteAggregator):
    """
    Aggregator for Oglaf webcomic.

    Ported from legacy TypeScript implementation.
    Handles extraction of comic images and conversion to base64.
    """

    def __init__(self, feed):
        super().__init__(feed)
        # Set default identifier if not provided
        if not self.identifier:
            self.identifier = "https://www.oglaf.com/feeds/rss/"

    @classmethod
    def get_default_identifier(cls) -> str:
        """Get default Oglaf identifier."""
        return "https://www.oglaf.com/feeds/rss/"

    def get_source_url(self) -> str:
        """Required for GReader API."""
        return "https://www.oglaf.com"

    # Selectors for main content
    content_selector = "div.content"

    # Selectors to strip from the main content div
    selectors_to_remove = [
        "#nav",
        "#tt",
        ".align",
        "#ll",
        "script",
        "style",
        "div.clear",
        "#ad_btm",
    ]

    def extract_header_element(self, article: Dict[str, Any]) -> Optional[Any]:
        """Disable header element extraction for Oglaf as the comic is the main content."""
        return None

    def process_content(self, html: str, article: Dict[str, Any]) -> str:
        """
        Process Oglaf content by extracting the comic image and converting to base64.
        """
        soup = BeautifulSoup(html, "html.parser")

        # Find the comic image
        comic_img = soup.select_one("#strip")
        if not comic_img:
            # Fallback selectors from legacy
            comic_img = soup.select_one(".content img, #content img, .comic img")

        if isinstance(comic_img, Tag):
            img_url = get_attr_str(comic_img, "src")
            # Handle relative URLs
            if img_url.startswith("/"):
                img_url = "https://www.oglaf.com" + img_url
            elif not img_url.startswith("http") and "media.oglaf.com" not in img_url:
                # Handle other relative paths if any (usually media.oglaf.com)
                img_url = "https://media.oglaf.com/comic/" + img_url

            # Extract alt text
            alt_text = (
                get_attr_str(comic_img, "alt") or get_attr_str(comic_img, "title") or "Oglaf comic"
            )

            # Fetch image and convert to base64
            image_result = fetch_single_image(img_url)
            if image_result:
                b64_data = base64.b64encode(image_result["imageData"]).decode("utf-8")
                data_uri = f"data:{image_result['contentType']};base64,{b64_data}"
                new_html = (
                    f'<div style="text-align: center;">'
                    f'<img src="{data_uri}" alt="{alt_text}" style="max-width: 100%; height: auto;">'
                    f"</div>"
                )
            else:
                # Fallback to direct URL if fetching fails
                new_html = (
                    f'<div style="text-align: center;">'
                    f'<img src="{img_url}" alt="{alt_text}" style="max-width: 100%; height: auto;">'
                    f"</div>"
                )
        else:
            # If no image found, use the cleaned HTML (from extract_content)
            new_html = html

        # Format with footer (header image not used for Oglaf)
        return format_article_content(
            new_html,
            title=article["name"],
            url=article["identifier"],
        )
