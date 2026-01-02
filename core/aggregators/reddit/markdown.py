"""Reddit markdown conversion utilities."""

import html
import re

import markdown

from .urls import decode_html_entities_in_url

# Configure markdown with extensions
# Python markdown extensions: fenced_code, tables, nl2br (if available), sane_lists
# Note: nl2br may not be available by default, we'll handle newlines manually if needed
try:
    _md = markdown.Markdown(
        extensions=[
            "fenced_code",  # Support ```code blocks```
            "tables",  # Support tables
            "sane_lists",  # Better list handling
        ]
    )
except Exception:
    # Fallback to basic markdown if extensions fail
    _md = markdown.Markdown()


def convert_reddit_markdown(text: str) -> str:
    """
    Convert Reddit markdown to HTML.

    Handles Reddit-specific markdown extensions like ^superscript,
    ~~strikethrough~~, >!spoilers!<, and Giphy embeds.
    Then converts standard markdown to HTML using markdown library.

    Args:
        text: Reddit markdown text

    Returns:
        HTML string
    """
    if not text:
        return ""

    # Limit input size to prevent regex DoS attacks
    MAX_TEXT_LENGTH = 100000  # 100KB limit
    if len(text) > MAX_TEXT_LENGTH:
        text = text[:MAX_TEXT_LENGTH]

    # Handle Reddit preview images
    text = re.sub(
        r"(?<!\[\(])https?://preview\.redd\.it/[^\s)]+",
        lambda m: f'<img src="{decode_html_entities_in_url(m.group(0))}" alt="Reddit preview image">',
        text,
    )

    # Convert markdown links with preview.redd.it URLs to image tags
    text = re.sub(
        r"\[([^\]]{0,200})\]\((https?://preview\.redd\.it/[^\s)]{1,500})\)",
        lambda m: f'<img src="{decode_html_entities_in_url(m.group(2))}" alt="{m.group(1) or "Reddit preview image"}">',
        text,
    )

    # Handle Giphy images
    text = re.sub(
        r"!\[([^\]]*)\]\(giphy\|([a-z0-9]+)(?:\|[^)]+)?\)",
        lambda m: f'<img src="https://i.giphy.com/{m.group(2)}.gif" alt="Giphy GIF">',
        text,
        flags=re.IGNORECASE,
    )

    # Match img tags with giphy URLs
    text = re.sub(
        r'<img\s+[^>]{0,200}src\s*=\s*["\']giphy\|([a-z0-9]{1,50})(?:\|[^"\']{0,100})?["\'][^>]{0,200}>',
        lambda m: f'<img src="https://i.giphy.com/{m.group(1)}.gif" alt="Giphy GIF">',
        text,
        flags=re.IGNORECASE,
    )

    text = re.sub(
        r"(?<![\"'])giphy\|([a-z0-9]+)(?![\"'])",
        lambda m: f'<img src="https://i.giphy.com/{m.group(1)}.gif" alt="Giphy GIF">',
        text,
        flags=re.IGNORECASE,
    )

    # Handle Reddit-specific superscript syntax (before markdown conversion)
    text = re.sub(r"\^(\w+)", r"<sup>\1</sup>", text)
    text = re.sub(r"\^\(([^)]+)\)", r"<sup>\1</sup>", text)

    # Handle strikethrough (before markdown conversion)
    text = re.sub(r"~~(.+?)~~", r"<del>\1</del>", text)

    # Handle spoiler syntax (before markdown conversion)
    text = re.sub(
        r">!(.+?)!<",
        r'<span class="spoiler" style="background: #000; color: #000;">\1</span>',
        text,
    )

    # Convert markdown to HTML using markdown library
    html_content = _md.convert(text)
    _md.reset()  # Reset for next use

    return html_content


def escape_html(text: str) -> str:
    """
    Escape HTML special characters.

    Args:
        text: Text to escape

    Returns:
        Escaped text
    """
    return html.escape(text)
