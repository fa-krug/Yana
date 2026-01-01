"""Multi-page article detection and fetching for Mein-MMO."""

import re
import logging
from bs4 import BeautifulSoup
from typing import Set, Callable


def detect_pagination(html: str, logger: logging.Logger) -> Set[int]:
    """
    Detect page numbers from pagination elements.

    Looks for:
    - nav.navigation.pagination
    - div.gp-pagination
    - ul.page-numbers

    Args:
        html: HTML content to parse
        logger: Logger instance

    Returns:
        Set of page numbers (always includes 1)
    """
    soup = BeautifulSoup(html, "html.parser")
    page_numbers = {1}  # Always include page 1

    # Try multiple selectors
    pagination = (
        soup.select_one("nav.navigation.pagination")
        or soup.select_one("div.gp-pagination")
        or soup.select_one("ul.page-numbers")
    )

    if not pagination:
        return page_numbers

    # Extract page numbers from links
    for link in pagination.select("a.page-numbers, a.post-page-numbers"):
        # Try link text
        text = link.get_text(strip=True)
        if text.isdigit():
            page_numbers.add(int(text))

        # Try URL pattern: /article-name/2/
        href = link.get("href", "")
        if href:
            match = re.search(r"/(\d+)/?$", href)
            if match:
                page_numbers.add(int(match.group(1)))

    # Extract current page from spans
    for span in pagination.select("span.page-numbers, span.post-page-numbers, span.current"):
        text = span.get_text(strip=True)
        if text.isdigit():
            page_numbers.add(int(text))

    logger.info(f"Detected {len(page_numbers)} pages: {sorted(page_numbers)}")
    return page_numbers


def fetch_all_pages(base_url: str, page_numbers: Set[int], fetcher: Callable[[str], str], logger: logging.Logger) -> str:
    """
    Fetch all pages and combine content divs.

    Args:
        base_url: Base article URL
        page_numbers: Set of page numbers to fetch
        fetcher: Function to fetch HTML from URL
        logger: Logger instance

    Returns:
        Combined HTML with all content divs
    """
    sorted_pages = sorted(page_numbers)
    content_parts = []

    for page_num in sorted_pages:
        # Construct page URL
        if page_num == 1:
            page_url = base_url
        else:
            # Handle trailing slash
            if base_url.endswith("/"):
                page_url = f"{base_url}{page_num}/"
            else:
                page_url = f"{base_url}/{page_num}/"

        try:
            # Fetch page
            logger.debug(f"Fetching page {page_num}: {page_url}")
            page_html = fetcher(page_url)

            # Extract content div
            soup = BeautifulSoup(page_html, "html.parser")
            content_div = soup.select_one("div.gp-entry-content")

            if content_div:
                content_parts.append(str(content_div))
            else:
                logger.warning(f"No content div found on page {page_num}")

        except Exception as e:
            logger.error(f"Failed to fetch page {page_num}: {e}")
            continue

    # Join all content divs
    return "\n\n".join(content_parts)
