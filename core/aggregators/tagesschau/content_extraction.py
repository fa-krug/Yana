"""Tagesschau content extraction logic."""

from bs4 import BeautifulSoup, Tag


def extract_tagesschau_content(html: str) -> str:
    """
    Extract content from Tagesschau article using textabsatz paragraphs.

    Args:
        html: Raw HTML content

    Returns:
        Extracted HTML content
    """
    soup = BeautifulSoup(html, "html.parser")
    content_div = soup.new_tag("div", **{"class": "article-content"})

    # Find all paragraphs and headings
    for element in soup.find_all(["p", "h2"]):
        # Skip if element is inside unwanted containers
        if _should_skip_element(element):
            continue

        classes = element.get("class", [])
        if isinstance(classes, str):
            classes = [classes]

        if element.name == "p" and any("textabsatz" in c for c in classes):
            # Clone paragraph and remove all classes
            p_new = soup.new_tag("p")
            p_new.extend(element.contents)
            content_div.append(p_new)
        elif element.name == "h2" and any("trenner" in c for c in classes):
            # Extract heading text
            h2_new = soup.new_tag("h2")
            h2_new.string = element.get_text(strip=True)
            content_div.append(h2_new)

    return str(content_div)


def _should_skip_element(element: Tag) -> bool:
    """Check if element should be skipped based on its parents."""
    skip_classes = ["teaser", "bigfive", "accordion", "related"]

    for parent in element.parents:
        if isinstance(parent, Tag):
            classes = parent.get("class", [])
            if isinstance(classes, str):
                classes = [classes]

            if any(any(sc in c for sc in skip_classes) for c in classes):
                return True

    return False
