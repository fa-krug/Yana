"""Content extraction utilities using BeautifulSoup."""

import logging
from typing import List, Optional

from bs4 import BeautifulSoup, Tag

from .bs4_utils import get_attr_str
from .html_fetcher import fetch_html

logger = logging.getLogger(__name__)


def extract_main_content(
    html: str, selector: str, remove_selectors: Optional[List[str]] = None
) -> str:
    """
    Extract main content from HTML using CSS selector.

    Args:
        html: Full HTML document
        selector: CSS selector for main content
        remove_selectors: CSS selectors for elements to remove

    Returns:
        Extracted HTML content
    """
    soup = BeautifulSoup(html, "html.parser")

    # Find main content
    content = soup.select_one(selector)

    if not isinstance(content, Tag):
        # Fallback: return entire body
        body = soup.find("body")
        content = body if isinstance(body, Tag) else soup

    # Remove unwanted elements
    if remove_selectors and isinstance(content, Tag):
        for sel in remove_selectors:
            for elem in content.select(sel):
                elem.decompose()

    return str(content)


def find_image_on_page(url: str) -> Optional[str]:
    """
    Fetch a page and try to find a representative image (og:image, etc.).

    Args:
        url: URL to fetch

    Returns:
        Image URL or None
    """
    try:
        html = fetch_html(url, timeout=10)
        soup = BeautifulSoup(html, "html.parser")

        # 1. Try Open Graph image
        og_image = soup.find("meta", property="og:image")
        if og_image:
            img_url = get_attr_str(og_image, "content")
            if img_url:
                return img_url

        # 2. Try Twitter image
        twitter_image = soup.find("meta", name="twitter:image")
        if twitter_image:
            img_url = get_attr_str(twitter_image, "content")
            if img_url:
                return img_url

        # 3. Try <link rel="image_src">
        link_image = soup.find("link", rel="image_src")
        if link_image:
            img_url = get_attr_str(link_image, "href")
            if img_url:
                return img_url

        # 4. Fallback: try to find the largest image on the page (simple heuristic)
        # This is risky as it might pick up ads or icons.
        # Maybe safer to stick to meta tags for now as per "proper image" requirement.
        # But if we want to be more aggressive:
        # images = soup.find_all("img")
        # ... logic to filter by size ...

        return None

    except Exception as e:
        logger.debug(f"Failed to extract image from {url}: {e}")
        return None
