"""Reddit comment fetching and formatting utilities."""

import logging
from typing import List

import requests

from ..exceptions import ArticleSkipError
from ..utils.http_errors import is_4xx_error
from .auth import get_reddit_access_token
from .markdown import convert_reddit_markdown, escape_html
from .types import RedditComment

logger = logging.getLogger(__name__)


def format_comment_html(comment: RedditComment) -> str:
    """
    Format a single comment as HTML with link.

    Args:
        comment: RedditComment instance

    Returns:
        HTML string
    """
    author = comment.author or "[deleted]"
    body = convert_reddit_markdown(comment.body or "")
    comment_url = f"https://reddit.com{comment.permalink}"

    return f"""
<blockquote>
<p><strong>{escape_html(author)}</strong> | <a href="{comment_url}">source</a></p>
<div>{body}</div>
</blockquote>
"""


def fetch_post_comments(
    subreddit: str, post_id: str, comment_limit: int, user_id: int
) -> List[RedditComment]:
    """
    Fetch comments for a Reddit post.

    Args:
        subreddit: Subreddit name
        post_id: Post ID
        comment_limit: Maximum number of comments to return
        user_id: User ID for authentication

    Returns:
        List of RedditComment instances

    Raises:
        ArticleSkipError: On 4xx HTTP errors (article should be skipped)
    """
    try:
        access_token = get_reddit_access_token(user_id)
        url = f"https://oauth.reddit.com/r/{subreddit}/comments/{post_id}"
        response = requests.get(
            url,
            params={"sort": "best"},
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        response.raise_for_status()

        # Reddit comments API returns an array with two items:
        # [0] = post data
        # [1] = comments data
        if not isinstance(response.json(), list) or len(response.json()) < 2:
            return []

        comments_data = response.json()[1]
        if not comments_data.get("data", {}).get("children"):
            return []

        # Collect only top-level comments (direct replies to the post, not nested replies)
        top_level_comments = []
        for comment_item in comments_data["data"]["children"]:
            comment_data = comment_item.get("data", {})
            if (
                comment_data.get("body")
                and comment_data.get("body") != "[deleted]"
                and comment_data.get("body") != "[removed]"
            ):
                top_level_comments.append(RedditComment(comment_data))

        # Sort by score (descending) and filter out bots
        filtered = [
            c
            for c in top_level_comments
            if c.author
            and not c.author.lower().endswith("_bot")
            and not c.author.lower().endswith("-bot")
            and c.author.lower() != "automoderator"
        ]
        filtered.sort(key=lambda c: c.score or 0, reverse=True)

        # Get more than needed to account for filtering, then slice
        return filtered[: comment_limit * 2][:comment_limit]

    except requests.exceptions.HTTPError as e:
        # Check for 4xx errors - skip article on client errors
        status_code = is_4xx_error(e)
        if status_code is not None:
            logger.warning(
                f"4xx error fetching Reddit comments for r/{subreddit}/{post_id}, skipping article: {status_code}"
            )
            raise ArticleSkipError(
                f"Failed to fetch Reddit comments: {status_code} {str(e)}",
                status_code=status_code,
                original_error=e,
            ) from e
        logger.warning(f"Error fetching Reddit comments for r/{subreddit}/{post_id}: {e}")
        return []
    except Exception as e:
        logger.warning(f"Error fetching Reddit comments for r/{subreddit}/{post_id}: {e}")
        return []
