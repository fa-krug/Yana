"""Content formatting utilities."""

from typing import Optional


def format_article_content(
    content: str,
    title: str,
    url: str,
    header_image_url: Optional[str] = None,
    comments_content: Optional[str] = None,
) -> str:
    """
    Format article content with an optional header image, the main content, and a footer.

    Note: Title, author, and date are NOT added to the content as these
    are typically handled by the RSS reader client.

    Args:
        content: Main article content HTML
        title: Article title (used for image alt text)
        url: Article URL (used for footer source link)
        header_image_url: Optional URL of a header image
        comments_content: Optional HTML content for the comments section

    Returns:
        Formatted HTML string
    """
    parts = []

    # Optional header image
    if header_image_url:
        header_parts = [
            '<header style="margin-bottom: 1.5em; text-align: center;">',
            f'<img src="{header_image_url}" alt="{title}" style="max-width: 100%; height: auto; border-radius: 8px;">',
            "</header>",
        ]
        parts.append("\n".join(header_parts))

    # Main content section
    parts.append(f'<section data-sanitized-class="article-content">{content}</section>')

    # Comments section
    if comments_content:
        parts.append(
            f'<section data-sanitized-class="article-comments">{comments_content}</section>'
        )

    # Footer section
    parts.append(
        f'<footer><p>Source: <a href="{url}" target="_blank" rel="noopener">{url}</a></p></footer>'
    )

    return "\n\n".join(parts)
