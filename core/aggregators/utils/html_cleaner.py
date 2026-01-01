"""HTML cleaning and sanitization utilities."""

from bs4 import BeautifulSoup, Tag
from typing import List, Optional


def clean_html(html: str) -> str:
    """
    Basic HTML sanitization.

    Args:
        html: HTML content to clean

    Returns:
        Cleaned HTML string
    """
    soup = BeautifulSoup(html, "html.parser")

    # Remove comments
    for comment in soup.find_all(string=lambda text: isinstance(text, str) and text.strip().startswith("<!--")):
        comment.extract()

    return str(soup)


def remove_selectors(soup: BeautifulSoup, selectors: List[str]) -> None:
    """
    Remove elements matching CSS selectors from soup.

    Args:
        soup: BeautifulSoup object
        selectors: List of CSS selectors to remove
    """
    for selector in selectors:
        for elem in soup.select(selector):
            elem.decompose()


def remove_empty_elements(soup: BeautifulSoup, tags: List[str]) -> None:
    """
    Remove empty elements (no text and no images).

    Args:
        soup: BeautifulSoup object
        tags: List of tag names to check (e.g., ['p', 'div'])
    """
    for tag_name in tags:
        for elem in soup.find_all(tag_name):
            # Check if empty (no text and no images)
            if not elem.get_text(strip=True) and not elem.find("img"):
                elem.decompose()


def clean_data_attributes(soup: BeautifulSoup, keep: Optional[List[str]] = None) -> None:
    """
    Remove data attributes except those in the keep list.

    Args:
        soup: BeautifulSoup object
        keep: List of data attributes to preserve (e.g., ['data-src', 'data-srcset'])
    """
    if keep is None:
        keep = ["data-src", "data-srcset"]

    for elem in soup.find_all(True):
        attrs_to_remove = []
        for attr in elem.attrs:
            if attr.startswith("data-") and attr not in keep:
                attrs_to_remove.append(attr)

        for attr in attrs_to_remove:
            del elem[attr]


def sanitize_class_names(soup: BeautifulSoup) -> None:
    """
    Convert all class attributes to data-sanitized-class attributes.

    This prevents CSS conflicts by moving class names to data attributes.

    Args:
        soup: BeautifulSoup object
    """
    for elem in soup.find_all(True):
        if "class" in elem.attrs:
            # Get class value(s)
            classes = elem["class"]
            if isinstance(classes, list):
                class_str = " ".join(classes)
            else:
                class_str = str(classes)

            # Move to data-sanitized-class
            elem["data-sanitized-class"] = class_str

            # Remove original class attribute
            del elem["class"]
