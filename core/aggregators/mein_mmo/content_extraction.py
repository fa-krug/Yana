"""Mein-MMO content extraction logic."""

import logging
from bs4 import BeautifulSoup
from typing import Dict, Any, List

from .embed_processors import process_embeds
from ..utils import sanitize_class_names, remove_empty_elements, clean_data_attributes


def extract_mein_mmo_content(
    html: str, article: Dict[str, Any], selectors_to_remove: List[str], logger: logging.Logger
) -> str:
    """
    Extract and process Mein-MMO specific content.

    Steps:
    1. Parse HTML
    2. Find all content divs (multi-page support)
    3. Combine content from multiple pages
    4. Remove unwanted elements
    5. Process embeds (YouTube, Twitter, Reddit)
    6. Remove empty elements
    7. Clean data attributes
    8. Sanitize class names

    Args:
        html: HTML content (may contain multiple content divs for multi-page)
        article: Article dictionary
        selectors_to_remove: CSS selectors to remove
        logger: Logger instance

    Returns:
        Processed HTML content string
    """
    soup = BeautifulSoup(html, "html.parser")

    # Find all content divs (multi-page articles have multiple)
    content_divs = soup.select("div.gp-entry-content")

    if not content_divs:
        logger.warning(f"No content divs found for {article.get('identifier')}")
        return html

    # Combine content from all pages
    if len(content_divs) > 1:
        logger.info(f"Processing multi-page article with {len(content_divs)} pages")
        # Create wrapper div
        wrapper = soup.new_tag("div")
        wrapper["class"] = "gp-entry-content"
        for div in content_divs:
            # Move all children to wrapper
            for child in list(div.children):
                wrapper.append(child)
        content = wrapper
    else:
        content = content_divs[0]

    # Remove unwanted elements
    for selector in selectors_to_remove:
        for elem in content.select(selector):
            elem.decompose()

    # Process embeds
    process_embeds(content, logger)

    # Remove empty paragraphs and divs
    remove_empty_elements(content, ["p", "div"])

    # Clean data attributes (keep data-src and data-srcset for lazy loading)
    clean_data_attributes(content, keep=["data-src", "data-srcset"])

    # Sanitize class names
    sanitize_class_names(content)

    return str(content)
