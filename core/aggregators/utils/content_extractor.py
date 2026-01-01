"""Content extraction utilities using BeautifulSoup."""

from typing import List, Optional

from bs4 import BeautifulSoup


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

    if not content:
        # Fallback: return entire body
        content = soup.find("body") or soup

    # Remove unwanted elements
    if remove_selectors:
        for sel in remove_selectors:
            for elem in content.select(sel):
                elem.decompose()

    return str(content)
