"""HTML fetching utilities with retry logic."""

import time

import requests

USER_AGENT = "Mozilla/5.0 (compatible; YanaBot/1.0; +https://github.com/yourusername/yana)"


def fetch_html(url: str, timeout: int = 30, retries: int = 3) -> str:
    """
    Fetch HTML content from URL with retry logic.

    Args:
        url: URL to fetch
        timeout: Request timeout in seconds
        retries: Number of retry attempts

    Returns:
        HTML content as string

    Raises:
        requests.RequestException: If fetch fails after retries
    """
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
    }

    last_exception = None

    for attempt in range(retries):
        try:
            response = requests.get(url, headers=headers, timeout=timeout, allow_redirects=True)
            response.raise_for_status()
            return response.text

        except requests.RequestException as e:
            last_exception = e
            if attempt < retries - 1:
                wait_time = 2**attempt  # Exponential backoff
                time.sleep(wait_time)
            continue

    raise last_exception
