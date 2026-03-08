"""Comment extraction for MacTechNews articles."""

import logging
from typing import Optional

from bs4 import BeautifulSoup


def extract_comments(
    html: str,
    article_url: str,
    max_comments: int = 5,
    logger: Optional[logging.Logger] = None,
) -> Optional[str]:
    """
    Extract comments from MacTechNews article HTML.

    Comments are found within div.MtnCommentScroll containers. Each comment
    has author name, timestamp, and text content.

    Args:
        html: Full article HTML
        article_url: Article URL for building anchor links
        max_comments: Maximum number of comments to extract
        logger: Optional logger instance

    Returns:
        HTML string with formatted comments, or None if no comments found
    """
    if max_comments <= 0:
        return None

    if logger is None:
        logger = logging.getLogger(__name__)

    soup = BeautifulSoup(html, "html.parser")

    # Find the comments container
    comment_scroll = soup.select_one("div.MtnCommentScroll")
    if not comment_scroll:
        logger.debug("No MtnCommentScroll container found")
        return None

    # Find individual comments
    comments = comment_scroll.select("div.MtnComment")
    if not comments:
        logger.debug("No MtnComment elements found")
        return None

    logger.info(f"Found {len(comments)} comments, extracting up to {max_comments}")

    comment_parts = []
    for comment_el in comments[:max_comments]:
        comment_html = _process_comment(comment_el, article_url)
        if comment_html:
            comment_parts.append(comment_html)

    if not comment_parts:
        return None

    # Build comments section with header
    comments_url = f"{article_url}#comments"
    header = f'<h3><a href="{comments_url}">Comments</a></h3>'
    return f"<section>{header}{''.join(comment_parts)}</section>"


def _process_comment(comment_el: "BeautifulSoup", article_url: str) -> Optional[str]:
    """Process a single MacTechNews comment element into a blockquote."""
    # Extract author
    author_el = comment_el.select_one("span.MtnCommentAccountName")
    author = author_el.get_text(strip=True) if author_el else "Unknown"

    # Extract timestamp
    time_el = comment_el.select_one("span.MtnCommentTime")
    timestamp = ""
    if time_el:
        time_spans = time_el.find_all("span")
        timestamp = " ".join(span.get_text(strip=True) for span in time_spans)

    # Extract comment text
    text_el = comment_el.select_one("div.MtnCommentText")
    if not text_el:
        return None

    comment_text = str(text_el)

    # Build anchor URL from comment element ID
    comment_id = comment_el.get("id", "")
    anchor_url = f"{article_url}#{comment_id}" if comment_id else f"{article_url}#comments"

    # Format timestamp display
    ts_display = f" ({timestamp})" if timestamp else ""

    return (
        f"<blockquote>"
        f"<p><strong>{author}</strong>{ts_display} | "
        f'<a href="{anchor_url}">source</a></p>'
        f"<div>{comment_text}</div>"
        f"</blockquote>"
    )
