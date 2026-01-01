"""Mein-MMO utility functions."""

import logging
from bs4 import BeautifulSoup
from typing import Optional


def extract_header_image_url(html: str, logger: logging.Logger) -> Optional[str]:
    """
    Extract header image URL from Mein-MMO article.

    Strategy:
    1. Look for image with width="16" height="9" (aspect ratio marker)
    2. Fallback: First image in div#gp-page-header-inner

    Args:
        html: Full HTML of article page
        logger: Logger instance

    Returns:
        Image URL or None
    """
    soup = BeautifulSoup(html, "html.parser")

    # Strategy 1: Find 16:9 aspect ratio image
    header_img = soup.find("img", attrs={"width": "16", "height": "9"})
    if header_img:
        src = header_img.get("src")
        if src:
            logger.debug(f"Found header image (16:9): {src}")
            return src

    # Strategy 2: Header div image
    header_div = soup.select_one("div#gp-page-header-inner")
    if header_div:
        img = header_div.find("img")
        if img:
            src = img.get("src")
            if src:
                logger.debug(f"Found header image from header div: {src}")
                return src

    logger.debug("No header image found")
    return None
