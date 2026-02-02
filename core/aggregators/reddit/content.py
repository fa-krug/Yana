"""Reddit content building utilities."""

import logging
from typing import List

from ..exceptions import ArticleSkipError
from .comments import fetch_post_comments, format_comment_html
from .markdown import convert_reddit_markdown, escape_html
from .types import RedditPostData
from .urls import decode_html_entities_in_url, fix_reddit_media_url

logger = logging.getLogger(__name__)


def build_post_content(
    post: RedditPostData,
    comment_limit: int,
    subreddit: str,
    user_id: int,
    is_cross_post: bool = False,
) -> str:
    """
    Build post content with comments.

    Args:
        post: RedditPostData instance
        comment_limit: Number of comments to fetch
        subreddit: Subreddit name
        user_id: User ID for authentication
        is_cross_post: Whether this is a cross-post

    Returns:
        HTML content string
    """
    content_parts: List[str] = []

    # Add selftext part
    if post.selftext:
        selftext_html = convert_reddit_markdown(post.selftext)
        content_parts.append(f"<div>{selftext_html}</div>")

    # Add gallery media
    _add_gallery_media(post, content_parts)

    # Add link media
    _add_link_media(post, content_parts, is_cross_post)

    # Add comments section
    _add_comments_section(post, comment_limit, subreddit, user_id, content_parts)

    return "".join(content_parts)


def _add_selftext_part(post: RedditPostData, content_parts: List[str]) -> None:
    """Add selftext part to content."""
    if post.selftext:
        selftext_html = convert_reddit_markdown(post.selftext)
        content_parts.append(f"<div>{selftext_html}</div>")


def _process_gallery_item(item: dict, post: RedditPostData) -> str | None:
    """Process a single gallery item."""
    media_id = item.get("media_id")
    if not media_id:
        return None

    media_info = post.media_metadata.get(media_id) if post.media_metadata else None
    if not media_info:
        return None

    is_animated = media_info.get("e") == "AnimatedImage"
    media_url = None
    if is_animated:
        media_url = media_info.get("s", {}).get("gif") or media_info.get("s", {}).get("mp4")
    elif media_info.get("e") == "Image":
        media_url = media_info.get("s", {}).get("u")

    if not media_url:
        return None

    fixed_url = fix_reddit_media_url(decode_html_entities_in_url(media_url))
    caption = item.get("caption", "")
    alt = "Gallery image"
    if caption:
        alt = escape_html(caption)
    elif is_animated:
        alt = "Animated GIF"

    if caption:
        return f'<figure><img src="{fixed_url}" alt="{alt}"><figcaption>{alt}</figcaption></figure>'
    return f'<p><img src="{fixed_url}" alt="{alt}"></p>'


def _add_gallery_media(post: RedditPostData, content_parts: List[str]) -> None:
    """Add gallery media to content."""
    if not post.is_gallery or not post.media_metadata or not post.gallery_data:
        return

    items = post.gallery_data.get("items", [])
    for item in items:
        html = _process_gallery_item(item, post)
        if html:
            content_parts.append(html)


def _add_link_media(post: RedditPostData, content_parts: List[str], is_cross_post: bool) -> None:
    """Add link media to content."""
    if not post.url or post.is_gallery:
        return

    url = decode_html_entities_in_url(post.url)

    # Try media handlers in order
    if _process_link_media(post, url, content_parts):
        return

    # Fallback link
    if not is_cross_post and not post.is_self:
        content_parts.append(
            f'<p><a href="{url}" target="_blank" rel="noopener">{escape_html(url)}</a></p>'
        )


def _process_link_media(post: RedditPostData, url: str, content_parts: List[str]) -> bool:
    """Process link media by delegating to appropriate handler."""
    url_lower = url.lower()

    # Handle GIF media
    if url_lower.endswith((".gif", ".gifv")):
        from .images import extract_animated_gif_url

        gif_url = extract_animated_gif_url(post) or (
            url[:-1] if url_lower.endswith(".gifv") else url
        )
        fixed_url = fix_reddit_media_url(gif_url)
        if fixed_url:
            content_parts.append(f'<p><img src="{fixed_url}" alt="Animated GIF"></p>')
        return True

    # Handle direct image media
    is_image = (
        any(ext in url_lower for ext in [".jpg", ".jpeg", ".png", ".webp"])
        or "i.redd.it" in url_lower
    )
    if is_image:
        fixed_url = fix_reddit_media_url(url)
        if fixed_url:
            content_parts.append(
                f'<p><a href="{fixed_url}" target="_blank" rel="noopener">{escape_html(fixed_url)}</a></p>'
            )
        return True

    # Handle video media (Reddit videos and YouTube)
    if "v.redd.it" in url_lower:
        # Note: v.redd.it video links and thumbnails are now handled in the header
        # via aggregator.py process_content, so we don't add them to the body here.
        return True

    if "youtube.com" in url_lower or "youtu.be" in url_lower:
        content_parts.append(
            f'<p><a href="{url}" target="_blank" rel="noopener">▶ View Video on YouTube</a></p>'
        )
        return True

    # Handle Twitter/X links
    if "twitter.com" in url_lower or "x.com" in url_lower:
        from ..utils.twitter import build_tweet_embed_html

        embed_html = build_tweet_embed_html(url)
        if embed_html:
            content_parts.append(embed_html)
        else:
            # Fallback to plain link if API fetch fails
            content_parts.append(
                f'<p><a href="{url}" target="_blank" rel="noopener">View on X/Twitter</a></p>'
            )
        return True

    return False


def _add_comments_section(
    post: RedditPostData,
    comment_limit: int,
    subreddit: str,
    user_id: int,
    content_parts: List[str],
) -> None:
    """Add comments section to content."""
    decoded_permalink = decode_html_entities_in_url(post.permalink)
    permalink = f"https://reddit.com{decoded_permalink}"
    comment_section_parts = [
        f'<h3><a href="{permalink}" target="_blank" rel="noopener">Comments</a></h3>'
    ]

    if comment_limit > 0:
        try:
            comments = fetch_post_comments(subreddit, post.id, comment_limit, user_id)
            if comments:
                comment_htmls = [format_comment_html(comment) for comment in comments]
                comment_section_parts.append("".join(comment_htmls))
            else:
                comment_section_parts.append("<p><em>No comments yet.</em></p>")
        except ArticleSkipError:
            raise
        except Exception as e:
            logger.warning(f"Failed to fetch comments: {e}")
            comment_section_parts.append("<p><em>Comments unavailable.</em></p>")
    else:
        comment_section_parts.append("<p><em>Comments disabled.</em></p>")

    content_parts.append(f"<section>{''.join(comment_section_parts)}</section>")
