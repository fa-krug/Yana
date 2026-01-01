"""Content formatting utilities."""

from datetime import datetime
from typing import Optional


def format_article_content(
    content: str,
    title: str,
    url: str,
    author: Optional[str] = None,
    date: Optional[datetime] = None,
    header_image_url: Optional[str] = None,
    header_image_only: bool = False,
) -> str:
    """
    Format article content with header, sections, and footer.

    Structure (when header_image_only=False):
    - Header with title image (if available), title, and metadata
    - Main content
    - Footer with source link

    Structure (when header_image_only=True):
    - Header with only the image (no title, author, or date)
    - Main content
    - Footer with source link

    Args:
        content: Main article content HTML
        title: Article title
        url: Article URL
        author: Article author (not used when header_image_only=True)
        date: Publication date (not used when header_image_only=True)
        header_image_url: URL of header image
        header_image_only: If True, header contains only image; no title, author, or date

    Returns:
        Formatted HTML string
    """
    parts = []

    if header_image_only:
        # Header with image only, no title/author/date
        if header_image_url:
            header_parts = [
                "<header>",
                f'<img src="{header_image_url}" alt="Article header" style="max-width: 100%; height: auto;">',
                "</header>",
            ]
            parts.append("\n".join(header_parts))
    else:
        # Original behavior: header with image, title, and metadata
        header_parts = ["<header>"]

        # Title image
        if header_image_url:
            header_parts.append(
                f'<img src="{header_image_url}" alt="{title}" style="max-width: 100%; height: auto;">'
            )

        # Title
        header_parts.append(f"<h1>{title}</h1>")

        # Metadata
        metadata = []
        if author:
            metadata.append(f'<span data-sanitized-class="author">{author}</span>')
        if date:
            date_str = date.strftime("%Y-%m-%d %H:%M")
            metadata.append(f'<time datetime="{date.isoformat()}">{date_str}</time>')

        if metadata:
            header_parts.append(f'<p data-sanitized-class="metadata">{" | ".join(metadata)}</p>')

        header_parts.append("</header>")
        parts.append("\n".join(header_parts))

    # Main content section
    parts.append(f'<section data-sanitized-class="article-content">{content}</section>')

    # Footer section
    parts.append(
        f'<footer><p>Source: <a href="{url}" target="_blank" rel="noopener">{url}</a></p></footer>'
    )

    return "\n\n".join(parts)
