"""Reddit post fetching utilities."""

import logging

import requests

from .auth import get_reddit_access_token
from .types import RedditPostData

logger = logging.getLogger(__name__)


def fetch_reddit_post(subreddit: str, post_id: str, user_id: int) -> RedditPostData | None:
    """
    Fetch a single Reddit post by ID.

    Args:
        subreddit: Subreddit name
        post_id: Post ID
        user_id: User ID for authentication

    Returns:
        RedditPostData instance or None if not found
    """
    try:
        access_token = get_reddit_access_token(user_id)
        response = requests.get(
            f"https://oauth.reddit.com/r/{subreddit}/comments/{post_id}",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        response.raise_for_status()

        # Reddit comments API returns: [0] = post data, [1] = comments data
        data = response.json()
        if isinstance(data, list) and len(data) > 0:
            post_data = data[0].get("data", {}).get("children", [])
            if post_data and len(post_data) > 0:
                return RedditPostData(post_data[0].get("data", {}))

        return None

    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            logger.warning(f"Reddit post {post_id} in r/{subreddit} not found")
            return None
        if e.response.status_code == 403:
            logger.warning(f"Access forbidden to post {post_id} in r/{subreddit}")
            return None
        if e.response.status_code == 401:
            logger.error("Reddit authentication failed while fetching post")
            raise ValueError(
                "Reddit authentication failed. Please check your API credentials."
            ) from None
        logger.warning(f"Error fetching Reddit post {post_id} in r/{subreddit}: {e}")
        return None
    except Exception as e:
        logger.warning(f"Unexpected error fetching Reddit post {post_id} in r/{subreddit}: {e}")
        return None
