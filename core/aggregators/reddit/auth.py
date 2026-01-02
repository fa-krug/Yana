"""Reddit OAuth authentication utilities."""

import logging
import time
from typing import Any, Dict

import requests

logger = logging.getLogger(__name__)

# Token cache entry
_TokenCacheEntry = Dict[str, Any]
_token_cache: Dict[int, _TokenCacheEntry] = {}


def get_reddit_user_settings(user_id: int) -> Dict[str, Any]:
    """
    Get Reddit user settings for a user.

    Fetches settings from UserSettings model, creating default settings if they don't exist.

    Args:
        user_id: User ID

    Returns:
        Dict with reddit_enabled, reddit_client_id, reddit_client_secret, reddit_user_agent
    """
    from django.contrib.auth import get_user_model

    from core.models import UserSettings

    User = get_user_model()
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist as e:
        raise ValueError(f"User with id {user_id} does not exist") from e

    # Get or create user settings
    settings, created = UserSettings.objects.get_or_create(
        user=user,
        defaults={
            "reddit_enabled": False,
            "reddit_client_id": "",
            "reddit_client_secret": "",
            "reddit_user_agent": "Yana/1.0",
        },
    )

    return {
        "reddit_enabled": settings.reddit_enabled,
        "reddit_client_id": settings.reddit_client_id or "",
        "reddit_client_secret": settings.reddit_client_secret or "",
        "reddit_user_agent": settings.reddit_user_agent or "Yana/1.0",
    }


def get_reddit_access_token(user_id: int) -> str:
    """
    Get Reddit OAuth2 access token.

    Implements client credentials flow with token caching.

    Args:
        user_id: User ID

    Returns:
        Access token string

    Raises:
        ValueError: If Reddit is not enabled or credentials are missing
        requests.RequestException: If OAuth request fails
    """
    # Check cache
    cached = _token_cache.get(user_id)
    if cached and cached.get("expires_at", 0) > time.time() + 60:
        return cached["token"]

    # Get user settings
    settings = get_reddit_user_settings(user_id)

    if not settings.get("reddit_enabled"):
        raise ValueError("Reddit is not enabled. Please enable Reddit in your settings.")

    client_id = settings.get("reddit_client_id", "")
    client_secret = settings.get("reddit_client_secret", "")
    user_agent = settings.get("reddit_user_agent", "Yana/1.0")

    if not client_id or not client_secret:
        raise ValueError(
            "Reddit API credentials not configured. Please set Client ID and Client Secret."
        )

    # Request access token
    auth_url = "https://www.reddit.com/api/v1/access_token"
    auth_data = {"grant_type": "client_credentials"}

    try:
        response = requests.post(
            auth_url,
            data=auth_data,
            auth=(client_id, client_secret),
            headers={
                "User-Agent": user_agent,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            timeout=10,
        )
        response.raise_for_status()

        data = response.json()
        if (
            response.status_code == 200
            and data.get("access_token")
            and data.get("token_type") == "bearer"
        ):
            token = data["access_token"]
            expires_in = data.get("expires_in", 3600)
            expires_at = time.time() + expires_in - 60  # Cache with 1 minute buffer

            _token_cache[user_id] = {"token": token, "expires_at": expires_at}
            logger.debug(f"Reddit OAuth token obtained and cached for user {user_id}")
            return token

        raise ValueError("Invalid response from Reddit OAuth API")

    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 401:
            raise ValueError(
                "Invalid Reddit API credentials. Please check your Client ID and Client Secret."
            ) from e
        if e.response.status_code == 403:
            raise ValueError("Reddit app configuration issue. Check your app settings on Reddit.") from e
        if e.response.status_code == 429:
            raise ValueError("Rate limited by Reddit. Please try again later.") from e
        raise ValueError(f"Reddit OAuth error: {e.response.status_text or str(e)}") from e
    except requests.exceptions.RequestException as e:
        raise ValueError(f"Failed to get Reddit access token: {str(e)}") from e
