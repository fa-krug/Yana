"""
Twitter/X utilities for header element extraction.

Provides functions for:
- Detecting Twitter/X URLs
- Extracting tweet IDs
- Fetching tweet data from fxtwitter API
- Extracting images from tweets
"""

import re
from typing import Optional, Dict, Any, List
import requests
import logging

logger = logging.getLogger(__name__)

# fxtwitter API endpoint
FXTWITTER_API_BASE = "https://api.fxtwitter.com"


def is_twitter_url(url: str) -> bool:
    """
    Check if a URL is a Twitter/X URL.

    Handles:
    - twitter.com
    - x.com (new domain)
    - mobile.twitter.com

    Args:
        url: URL to check

    Returns:
        True if URL is from Twitter/X
    """
    if not url:
        return False

    twitter_domains = ["twitter.com", "x.com", "mobile.twitter.com"]
    return any(domain in url for domain in twitter_domains)


def extract_tweet_id(url: str) -> Optional[str]:
    """
    Extract tweet ID from Twitter/X URL.

    Pattern: /status/{TWEET_ID}

    Args:
        url: Twitter/X URL

    Returns:
        Tweet ID if found, None otherwise
    """
    if not url:
        return None

    match = re.search(r"/status/(\d+)", url)
    if match:
        return match.group(1)

    return None


def fetch_tweet_data(tweet_id: str, timeout: int = 10) -> Optional[Dict[str, Any]]:
    """
    Fetch tweet data from fxtwitter API.

    fxtwitter provides a cleaner API for accessing Twitter/X data
    including direct image URLs without authentication.

    Args:
        tweet_id: Tweet ID to fetch
        timeout: Request timeout in seconds

    Returns:
        Tweet data dict if successful, None if failed
    """
    if not tweet_id:
        return None

    try:
        url = f"{FXTWITTER_API_BASE}/status/{tweet_id}"
        headers = {"User-Agent": "Yana/1.0"}

        response = requests.get(url, headers=headers, timeout=timeout)
        response.raise_for_status()

        data = response.json()
        logger.debug(f"Fetched tweet data for {tweet_id}")
        return data

    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            logger.debug(f"Tweet {tweet_id} not found")
        else:
            logger.warning(
                f"HTTP error fetching tweet {tweet_id}: {e.response.status_code}"
            )
    except requests.exceptions.RequestException as e:
        logger.warning(f"Error fetching tweet {tweet_id}: {e}")
    except Exception as e:
        logger.error(f"Unexpected error fetching tweet {tweet_id}: {e}")

    return None


def extract_image_urls_from_tweet(data: Dict[str, Any]) -> List[str]:
    """
    Extract image URLs from tweet data.

    Searches for images in tweet media objects.

    Args:
        data: Tweet data dict from fxtwitter API

    Returns:
        List of image URLs found in tweet
    """
    if not data:
        return []

    image_urls = []

    try:
        # fxtwitter API structure: data.tweet.media
        tweet = data.get("tweet", {})
        media = tweet.get("media", {})

        # Try photos first
        if "photos" in media:
            for photo in media["photos"]:
                if isinstance(photo, dict) and "url" in photo:
                    image_urls.append(photo["url"])

        # Try all media if no photos found
        if not image_urls and "all" in media:
            for item in media["all"]:
                if isinstance(item, dict) and item.get("type") == "photo":
                    if "url" in item:
                        image_urls.append(item["url"])

    except (KeyError, TypeError) as e:
        logger.debug(f"Error extracting images from tweet: {e}")

    return image_urls


def get_first_tweet_image(data: Dict[str, Any]) -> Optional[str]:
    """
    Get the first image URL from tweet data.

    Args:
        data: Tweet data dict from fxtwitter API

    Returns:
        First image URL if found, None otherwise
    """
    images = extract_image_urls_from_tweet(data)
    return images[0] if images else None
