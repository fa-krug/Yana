"""Mein-MMO utility functions."""

import logging
from typing import Optional

from bs4 import BeautifulSoup


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
    logger.debug("[extract_header_image_url] Starting header image extraction")
    soup = BeautifulSoup(html, "html.parser")

    # Strategy 1: Find 16:9 aspect ratio image
    logger.debug("[extract_header_image_url] Strategy 1: Looking for img[width='16'][height='9']")
    header_img = soup.find("img", attrs={"width": "16", "height": "9"})
    if header_img:
        src = header_img.get("src")
        if src:
            logger.info(f"[extract_header_image_url] Found header image (16:9): {src}")
            return src
        else:
            logger.debug("[extract_header_image_url] Strategy 1: Image found but no src attribute")

    # Strategy 2: Header div image
    logger.debug("[extract_header_image_url] Strategy 2: Looking in div#gp-page-header-inner")
    header_div = soup.select_one("div#gp-page-header-inner")
    if header_div:
        logger.debug("[extract_header_image_url] Header div found, searching for img")
        img = header_div.find("img")
        if img:
            src = img.get("src")
            if src:
                logger.info(f"[extract_header_image_url] Found header image from header div: {src}")
                return src
            else:
                logger.debug("[extract_header_image_url] Image in header div has no src attribute")
        else:
            logger.debug("[extract_header_image_url] No img found in header div")
    else:
        logger.debug("[extract_header_image_url] div#gp-page-header-inner not found")

    logger.debug("[extract_header_image_url] No header image found using any strategy")
    return None
