"""Mein-MMO content extraction logic."""

import logging
from typing import Any, Dict, List

from bs4 import BeautifulSoup

from ..utils import clean_data_attributes, remove_empty_elements, sanitize_class_names
from .embed_processors import process_embeds


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
    logger.debug(f"Starting content extraction for {article.get('identifier')}")
    soup = BeautifulSoup(html, "html.parser")

    # Find all content divs (multi-page articles have multiple)
    content_divs = soup.select("div.gp-entry-content")
    logger.debug(f"Found {len(content_divs)} content div(s)")

    if not content_divs:
        logger.warning(f"No content divs found for {article.get('identifier')}, returning raw HTML")
        return html

    # Combine content from all pages
    if len(content_divs) > 1:
        logger.info(f"Multi-page article detected: combining {len(content_divs)} content divs")
        # Create wrapper div
        wrapper = soup.new_tag("div")
        wrapper["class"] = "gp-entry-content"
        for div in content_divs:
            # Move all children to wrapper
            for child in list(div.children):
                wrapper.append(child)
        content = wrapper
        logger.debug(f"Combined content div created, size: {len(str(content))} bytes")
    else:
        content = content_divs[0]
        logger.debug("Single page article, using first content div")

    # Remove unwanted elements
    logger.debug(f"Removing unwanted elements using {len(selectors_to_remove)} selectors")
    removed_count = 0
    for selector in selectors_to_remove:
        elements = content.select(selector)
        for elem in elements:
            elem.decompose()
            removed_count += 1
    logger.debug(f"Removed {removed_count} unwanted elements")

    # Remove pagination markers like "Weiter geht es auf Seite 2."
    for em in content.find_all("em"):
        text = em.get_text()
        if text and "Weiter geht es auf Seite" in text:
            p_parent = em.find_parent("p")
            if p_parent:
                p_parent.decompose()
            else:
                em.decompose()
            removed_count += 1
    logger.debug(f"Removed pagination markers, total removed: {removed_count}")

    # Process embeds
    logger.debug("Processing embeds (YouTube, Twitter, Reddit)")
    process_embeds(content, logger)

    # Remove empty paragraphs and divs
    logger.debug("Removing empty paragraphs and divs")
    remove_empty_elements(content, ["p", "div"])

    # Clean data attributes (keep data-src and data-srcset for lazy loading)
    logger.debug("Cleaning data attributes (keeping data-src and data-srcset)")
    clean_data_attributes(content, keep=["data-src", "data-srcset"])

    # Sanitize class names
    logger.debug("Sanitizing class names")
    sanitize_class_names(content)

    result = str(content)
    logger.info(f"Content extraction complete: {len(result)} bytes")
    return result
