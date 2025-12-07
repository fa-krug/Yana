"""
Fetching and caching functionality for aggregators.

This module provides:
- RSS feed fetching with feedparser
- Article HTML fetching with Playwright (with browser pooling)
- Image fetching with fallback strategies
- LRU caching with TTL for fetched content
- Special image extraction for YouTube, Twitter/X, and meta tags
"""

import contextlib
import hashlib
import logging
import mimetypes
import re
import threading
import time
from collections import OrderedDict
from typing import TYPE_CHECKING, Any
from urllib.parse import urljoin, urlparse

import feedparser
import requests
from bs4 import BeautifulSoup
from django.db import close_old_connections
from playwright.sync_api import Browser, Page, sync_playwright
from playwright.sync_api import TimeoutError as PlaywrightTimeout

from .exceptions import ContentFetchError

if TYPE_CHECKING:
    from .models import RawArticle

from .utils import extract_youtube_video_id

logger = logging.getLogger(__name__)

# Cache settings
CACHE_MAX_SIZE = 1000  # Maximum number of cached URLs
CACHE_TTL_SECONDS = 3600  # Cache entries expire after 1 hour

# LRU cache with TTL for URLs
_url_cache: OrderedDict[str, tuple[str, float]] = OrderedDict()
_cache_lock = threading.Lock()

# Thread-local storage for Playwright instances and browser pools
# Each thread (e.g., ThreadPoolExecutor worker) gets its own instance
_thread_local = threading.local()


# ============================================================================
# RSS Feed Fetching
# ============================================================================


def fetch_feed(feed_url: str) -> feedparser.FeedParserDict:
    """
    Fetch and parse an RSS feed using feedparser.

    Args:
        feed_url: The URL of the RSS feed to fetch

    Returns:
        Parsed feed data

    Raises:
        Exception: If the feed cannot be fetched or parsed
    """
    logger.info(f"Fetching RSS feed from {feed_url}")

    try:
        feed = feedparser.parse(feed_url)

        if feed.bozo:
            logger.warning(f"Feed parsing encountered issues: {feed.bozo_exception}")

        if not feed.entries:
            logger.warning(f"No entries found in feed {feed_url}")
        else:
            logger.info(
                f"Successfully fetched {len(feed.entries)} entries from {feed_url}"
            )

        return feed

    except Exception as e:
        logger.error(f"Error fetching feed {feed_url}: {e}", exc_info=True)
        raise


# ============================================================================
# Browser Pool Management
# ============================================================================


def _get_browser() -> Browser:
    """
    Get a browser instance from the pool or create a new one.

    Uses thread-local storage so each thread has its own Playwright instance
    and browser pool. This prevents greenlet errors when using ThreadPoolExecutor.

    Returns:
        A Playwright Browser instance
    """
    # Initialize thread-local storage if needed
    if not hasattr(_thread_local, "browser_pool"):
        _thread_local.browser_pool = []
    if not hasattr(_thread_local, "playwright_instance"):
        _thread_local.playwright_instance = None

    # Try to get a browser from this thread's pool
    if _thread_local.browser_pool:
        return _thread_local.browser_pool.pop()

    # Create new browser if pool is empty
    if _thread_local.playwright_instance is None:
        # Close Django DB connections before Playwright creates its async event loop
        # This prevents "cannot call from async context" errors with Django ORM
        close_old_connections()
        _thread_local.playwright_instance = sync_playwright().start()

    return _thread_local.playwright_instance.chromium.launch(headless=True)


def _return_browser(browser: Browser) -> None:
    """
    Return a browser instance to the pool.

    Uses thread-local storage so each thread maintains its own browser pool.

    Args:
        browser: The browser instance to return
    """
    # Initialize thread-local storage if needed
    if not hasattr(_thread_local, "browser_pool"):
        _thread_local.browser_pool = []

    # Keep at most 3 browsers in pool per thread
    if len(_thread_local.browser_pool) < 3:
        _thread_local.browser_pool.append(browser)
    else:
        browser.close()


def close_browser_pool() -> None:
    """
    Close all browsers in the current thread's pool and Playwright instance.

    Note: This only closes resources for the current thread. In a multi-threaded
    environment (e.g., ThreadPoolExecutor), each thread manages its own resources
    and they will be cleaned up when the thread exits.
    """
    # Close browsers in current thread's pool
    if hasattr(_thread_local, "browser_pool"):
        for browser in _thread_local.browser_pool:
            with contextlib.suppress(Exception):
                browser.close()
        _thread_local.browser_pool.clear()

    # Stop current thread's Playwright instance
    if (
        hasattr(_thread_local, "playwright_instance")
        and _thread_local.playwright_instance
    ):
        with contextlib.suppress(Exception):
            _thread_local.playwright_instance.stop()
        _thread_local.playwright_instance = None

    logger.info("Browser pool closed for current thread")


# ============================================================================
# Content Caching
# ============================================================================


def _get_cached_content(cache_key: str) -> str | None:
    """
    Get content from cache if it exists and hasn't expired.

    Args:
        cache_key: The cache key to look up

    Returns:
        Cached content or None if not found/expired
    """
    with _cache_lock:
        if cache_key in _url_cache:
            content, timestamp = _url_cache[cache_key]
            if time.time() - timestamp < CACHE_TTL_SECONDS:
                # Move to end (most recently used)
                _url_cache.move_to_end(cache_key)
                return content
            else:
                # Expired, remove it
                del _url_cache[cache_key]
    return None


def _set_cached_content(cache_key: str, content: str) -> None:
    """
    Set content in cache with TTL and enforce max size.

    Args:
        cache_key: The cache key
        content: The content to cache
    """
    with _cache_lock:
        # Remove oldest entries if at capacity
        while len(_url_cache) >= CACHE_MAX_SIZE:
            _url_cache.popitem(last=False)

        _url_cache[cache_key] = (content, time.time())


def clear_cache() -> None:
    """Clear the URL cache."""
    global _url_cache
    with _cache_lock:
        logger.info(f"Clearing URL cache ({len(_url_cache)} entries)")
        _url_cache.clear()


def get_cache_stats() -> dict[str, Any]:
    """
    Get cache statistics.

    Returns:
        Dictionary with cache statistics
    """
    with _cache_lock:
        current_time = time.time()
        valid_entries = 0
        total_size = 0

        for _cache_key, (content, timestamp) in _url_cache.items():
            if current_time - timestamp < CACHE_TTL_SECONDS:
                valid_entries += 1
                total_size += len(content)

        return {
            "entries": len(_url_cache),
            "valid_entries": valid_entries,
            "total_size_bytes": total_size,
            "max_size": CACHE_MAX_SIZE,
            "ttl_seconds": CACHE_TTL_SECONDS,
        }


# ============================================================================
# Article Content Fetching
# ============================================================================


def fetch_article_content(
    url: str,
    use_cache: bool = True,
    timeout: int = 30000,
    wait_for_selector: str | None = None,
) -> str:
    """
    Fetch article content from a URL using Playwright.

    This function uses Playwright with browser pooling to render the page
    and extract the HTML content. It supports caching with TTL.

    The function attempts to handle lazy-loaded images by:
    1. Waiting for network to be idle
    2. Scrolling the page to trigger lazy loading
    3. Waiting for images to load

    Args:
        url: The URL of the article to fetch
        use_cache: Whether to use cached content if available (default: True)
        timeout: Page load timeout in milliseconds (default: 30000)
        wait_for_selector: Optional CSS selector to wait for before extracting content

    Returns:
        Sanitized HTML content of the article

    Raises:
        Exception: If the article cannot be fetched
    """
    # Generate cache key
    cache_key = hashlib.md5(url.encode()).hexdigest()

    # Check cache
    if use_cache:
        cached = _get_cached_content(cache_key)
        if cached:
            logger.info(f"Returning cached content for {url}")
            return cached

    logger.info(f"Fetching article content from {url}")

    browser = None
    try:
        # Get browser from pool
        browser = _get_browser()
        page: Page = browser.new_page()

        # Set timeout
        page.set_default_timeout(timeout)

        # Navigate to URL - try networkidle first for better image loading
        logger.debug(f"Navigating to {url}")
        try:
            # Try with networkidle for better dynamic content loading
            page.goto(url, wait_until="networkidle", timeout=timeout)
        except PlaywrightTimeout:
            # Fall back to domcontentloaded if networkidle times out
            logger.debug(
                f"Network idle timeout for {url}, falling back to domcontentloaded"
            )
            page.goto(url, wait_until="domcontentloaded", timeout=timeout)

        # Wait for specific selector if provided
        if wait_for_selector:
            logger.debug(f"Waiting for selector: {wait_for_selector}")
            page.wait_for_selector(wait_for_selector, timeout=timeout)

        # Scroll page to trigger lazy loading of images
        try:
            logger.debug("Scrolling page to trigger lazy loading")
            # Scroll to bottom
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            # Wait a bit for images to start loading
            page.wait_for_timeout(1000)
            # Scroll back to top
            page.evaluate("window.scrollTo(0, 0)")
            # Wait a bit more for any remaining images
            page.wait_for_timeout(1000)
        except Exception as e:
            logger.debug(f"Error during scrolling: {e}")

        # Wait for images with data-src to be converted to src (lazy loading)
        try:
            # Wait for lazy-loaded images to be processed (max 2 seconds)
            page.wait_for_function(
                """() => {
                    const lazyImages = document.querySelectorAll('img[data-src]');
                    const loadedImages = document.querySelectorAll('img[src]');
                    return lazyImages.length === 0 || loadedImages.length > 0;
                }""",
                timeout=2000,
            )
        except PlaywrightTimeout:
            logger.debug("Lazy loading wait timed out, continuing anyway")

        # Get page content
        content = page.content()

        # Close page but return browser to pool
        page.close()

        # Cache the result
        _set_cached_content(cache_key, content)
        logger.info(
            f"Successfully fetched and cached content from {url} ({len(content)} chars)"
        )
        return content

    except PlaywrightTimeout as e:
        logger.error(f"Timeout fetching article from {url}: {e}", exc_info=True)
        raise ContentFetchError(f"Timeout loading page: {url}") from e

    except Exception as e:
        logger.error(f"Error fetching article content from {url}: {e}", exc_info=True)
        raise ContentFetchError(f"Failed to fetch content from {url}: {e}") from e

    finally:
        # Return browser to pool
        if browser:
            with contextlib.suppress(Exception):
                _return_browser(browser)


# ============================================================================
# Image Fetching
# ============================================================================


def _fetch_html_with_playwright(url: str) -> str | None:
    """
    Fetch HTML content using Playwright (for pages that require JavaScript rendering).

    This is a lightweight version of fetch_article_content that doesn't use caching
    or scrolling, suitable for quick image extraction.

    Args:
        url: The URL to fetch

    Returns:
        HTML content or None on failure
    """
    browser = None
    try:
        browser = _get_browser()
        page: Page = browser.new_page()
        page.set_default_timeout(10000)

        # Navigate to URL
        page.goto(url, wait_until="networkidle", timeout=10000)

        # Get page content
        content = page.content()
        page.close()

        return content

    except Exception as e:
        logger.debug(f"Playwright HTML fetch failed for {url}: {e}")
        return None
    finally:
        if browser:
            with contextlib.suppress(Exception):
                _return_browser(browser)


def _fetch_single_image_with_playwright(
    url: str,
) -> tuple[str, bytes | None, str | None]:
    """
    Fetch a single image using Playwright (for sites that block regular requests).

    Validates that the response is actually an image (not HTML error pages).

    Args:
        url: The image URL to fetch

    Returns:
        Tuple of (url, image_data, content_type) or (url, None, None) on failure
    """
    browser = None
    try:
        browser = _get_browser()
        page: Page = browser.new_page()
        page.set_default_timeout(10000)

        # Navigate to the image URL
        response = page.goto(url, wait_until="networkidle")

        if response and response.ok:
            # Get the image data
            image_data = response.body()

            # Determine content type
            content_type = response.headers.get("content-type", "")
            if not content_type or content_type == "application/octet-stream":
                mime_type, _ = mimetypes.guess_type(url)
                content_type = mime_type or "image/jpeg"
            else:
                content_type = content_type.split(";")[0].strip()

            page.close()

            # CRITICAL: Validate that we actually got an image, not HTML
            if not content_type.startswith("image/"):
                logger.warning(
                    f"Playwright: URL returned non-image content type: {content_type} for {url}"
                )
                return (url, None, None)

            # Additional validation: Try to parse as image with PIL
            try:
                import io

                from PIL import Image

                img = Image.open(io.BytesIO(image_data))
                img.verify()  # Verify it's actually a valid image
                logger.debug(
                    f"Playwright: Successfully validated image: {content_type}, {len(image_data)} bytes"
                )
            except Exception as e:
                logger.warning(
                    f"Playwright: Content claims to be {content_type} but failed PIL validation: {e}"
                )
                return (url, None, None)

            return (url, image_data, content_type)
        else:
            page.close()
            return (url, None, None)

    except Exception as e:
        logger.debug(f"Playwright fetch failed for {url}: {e}")
        return (url, None, None)
    finally:
        if browser:
            with contextlib.suppress(Exception):
                _return_browser(browser)


def _fetch_single_image(url: str) -> tuple[str, bytes | None, str | None]:
    """
    Fetch a single image from URL with validation.

    First tries with requests (fast), falls back to Playwright for protected images.
    Validates that the response is actually an image (not HTML error pages, redirects, etc.)

    Args:
        url: The image URL to fetch

    Returns:
        Tuple of (url, image_data, content_type) or (url, None, None) on failure
    """
    try:
        # Use full browser headers for better compatibility with sites like Reddit
        # Be explicit that we only want images to reduce HTML redirects
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Referer": url,
            "Sec-Fetch-Dest": "image",
            "Sec-Fetch-Mode": "no-cors",
            "Sec-Fetch-Site": "cross-site",
            "Cache-Control": "no-cache",
        }

        response = requests.get(url, timeout=10, headers=headers, allow_redirects=True)
        response.raise_for_status()

        # Determine MIME type
        content_type = response.headers.get("Content-Type", "")
        if not content_type or content_type == "application/octet-stream":
            mime_type, _ = mimetypes.guess_type(url)
            content_type = mime_type or "image/jpeg"
        else:
            content_type = content_type.split(";")[0].strip()

        # CRITICAL: Validate that we actually got an image, not HTML
        # This prevents "data:text/html;base64,..." from being created
        if not content_type.startswith("image/"):
            logger.warning(
                f"URL returned non-image content type: {content_type} for {url}"
            )
            return (url, None, None)

        # Additional validation: Try to parse as image with PIL
        # This catches cases where Content-Type claims to be an image but isn't
        try:
            import io

            from PIL import Image

            img = Image.open(io.BytesIO(response.content))
            img.verify()  # Verify it's actually a valid image
            logger.debug(
                f"Successfully validated image: {content_type}, {len(response.content)} bytes"
            )
        except Exception as e:
            logger.warning(
                f"Content claims to be {content_type} but failed PIL validation: {e}"
            )
            return (url, None, None)

        return (url, response.content, content_type)
    except requests.exceptions.HTTPError as e:
        # If we get a 403 or other HTTP error, try with Playwright for protected images
        if e.response and e.response.status_code in (403, 401):
            logger.debug(
                f"HTTP {e.response.status_code} for {url}, trying with Playwright"
            )
            return _fetch_single_image_with_playwright(url)
        logger.warning(f"Failed to fetch image {url}: {e}")
        return (url, None, None)
    except Exception as e:
        logger.warning(f"Failed to fetch image {url}: {e}")
        return (url, None, None)


def extract_image_from_url(
    url: str, metadata: dict | None = None, is_header_image: bool = False
) -> tuple[bytes, str] | None:
    """
    Extract an image from a URL using multiple strategies.

    Tries in order:
    1. If URL is an image, download it directly
    2. YouTube videos - extract thumbnail
    3. Reddit videos (v.redd.it) - extract from API preview data if provided
    4. X.com/Twitter - extract image from tweet
    5. Reddit posts - extract image from meta tags
    6. Extract og:image or twitter:image meta tags
    7. Get first image on the page

    Args:
        url: The URL to extract an image from
        metadata: Optional metadata dict that may contain platform-specific data:
            - 'reddit_preview': Reddit API preview dict for v.redd.it videos
        is_header_image: If True, skip width/height filtering (header images may have
                         small attributes but are still valid)

    Returns:
        Tuple of (image_data, content_type) or None if no image found
    """
    logger.debug(f"Extracting image from URL: {url}")

    try:
        # Check if URL is an image directly
        # Parse URL to handle query parameters (e.g., ?auto=webp&s=...)
        parsed_url = urlparse(url)
        url_path = parsed_url.path.lower()

        if any(
            url_path.endswith(ext)
            for ext in [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"]
        ):
            logger.debug(f"URL is an image file: {url}")
            _, image_data, content_type = _fetch_single_image(url)
            if image_data:
                return (image_data, content_type)

        # Special handling for YouTube URLs
        video_id = extract_youtube_video_id(url)
        if video_id:
            logger.debug(f"YouTube video detected, extracting thumbnail: {video_id}")
            # Try maxresdefault first (highest quality), fall back to hqdefault
            for quality in ["maxresdefault", "hqdefault"]:
                thumbnail_url = f"https://img.youtube.com/vi/{video_id}/{quality}.jpg"
                logger.debug(f"Trying YouTube thumbnail: {thumbnail_url}")
                _, image_data, content_type = _fetch_single_image(thumbnail_url)
                if image_data and len(image_data) > 1000:  # Valid image
                    return (image_data, content_type)

        # Special handling for Reddit videos (v.redd.it)
        if "v.redd.it" in url:
            logger.debug(f"v.redd.it video detected: {url}")

            # First, try to use metadata if provided (most efficient - no HTTP request)
            if metadata and "reddit_preview" in metadata:
                try:
                    preview = metadata["reddit_preview"]
                    if preview and "images" in preview and preview["images"]:
                        source = preview["images"][0].get("source")
                        if source and "url" in source:
                            import html

                            preview_url = html.unescape(source["url"])
                            logger.debug(
                                f"Using Reddit preview from metadata: {preview_url}"
                            )
                            _, image_data, content_type = _fetch_single_image(
                                preview_url
                            )
                            if image_data:
                                return (image_data, content_type)
                except (KeyError, IndexError, AttributeError) as e:
                    logger.debug(f"Failed to use Reddit metadata: {e}")

            # Fallback: Fetch the v.redd.it page and extract preview from meta tags
            try:
                logger.debug(f"Fetching v.redd.it page to extract preview: {url}")
                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
                response = requests.get(url, headers=headers, timeout=10)
                response.raise_for_status()

                soup = BeautifulSoup(response.text, "html.parser")

                # Try og:image meta tag
                og_image = soup.find("meta", property="og:image")
                if og_image and og_image.get("content"):
                    preview_url = og_image["content"]
                    logger.debug(f"Found v.redd.it preview via og:image: {preview_url}")
                    _, image_data, content_type = _fetch_single_image(preview_url)
                    if image_data:
                        return (image_data, content_type)

                # Try twitter:image meta tag
                twitter_image = soup.find("meta", attrs={"name": "twitter:image"})
                if twitter_image and twitter_image.get("content"):
                    preview_url = twitter_image["content"]
                    logger.debug(
                        f"Found v.redd.it preview via twitter:image: {preview_url}"
                    )
                    _, image_data, content_type = _fetch_single_image(preview_url)
                    if image_data:
                        return (image_data, content_type)

            except Exception as e:
                logger.warning(f"Failed to fetch v.redd.it preview from page: {e}")

        # Special handling for X.com/Twitter URLs
        parsed_url = urlparse(url)
        if parsed_url.netloc in (
            "x.com",
            "www.x.com",
            "twitter.com",
            "www.twitter.com",
            "mobile.twitter.com",
        ):
            logger.debug(f"X.com/Twitter URL detected: {url}")
            # Extract tweet ID from URL (e.g., /status/1234567890)
            tweet_id_match = re.search(r"/status/(\d+)", url)
            if tweet_id_match:
                tweet_id = tweet_id_match.group(1)
                logger.debug(f"Extracted tweet ID: {tweet_id}")

                # Use fxtwitter.com API to get tweet media
                try:
                    api_url = f"https://api.fxtwitter.com/status/{tweet_id}"
                    logger.debug(f"Fetching tweet data from: {api_url}")

                    response = requests.get(api_url, timeout=10)
                    response.raise_for_status()

                    data = response.json()

                    # Try to extract images from the API response
                    image_urls = []

                    # Check primary location: tweet.media.photos
                    if (
                        "tweet" in data
                        and "media" in data["tweet"]
                        and "photos" in data["tweet"]["media"]
                    ):
                        photos = data["tweet"]["media"]["photos"]
                        if isinstance(photos, list):
                            image_urls.extend(
                                photo.get("url") for photo in photos if photo.get("url")
                            )
                            logger.debug(
                                f"Found {len(image_urls)} photos in tweet.media.photos"
                            )

                    # Fallback: check tweet.media.all for photo type
                    if (
                        not image_urls
                        and "tweet" in data
                        and "media" in data["tweet"]
                        and "all" in data["tweet"]["media"]
                    ):
                        all_media = data["tweet"]["media"]["all"]
                        if isinstance(all_media, list):
                            for media in all_media:
                                if media.get("type") == "photo" and media.get("url"):
                                    image_urls.append(media["url"])
                            logger.debug(
                                f"Found {len(image_urls)} photos in tweet.media.all"
                            )

                    # Download the first image found
                    if image_urls:
                        image_url = image_urls[0]
                        logger.debug(f"Downloading X.com image: {image_url}")
                        _, image_data, content_type = _fetch_single_image(image_url)
                        if image_data:
                            return (image_data, content_type)
                    else:
                        logger.warning(
                            f"No images found in fxtwitter API response for tweet {tweet_id}"
                        )

                except Exception as e:
                    logger.warning(
                        f"Failed to extract X.com image via fxtwitter API: {e}"
                    )
            else:
                logger.debug(f"Could not extract tweet ID from URL: {url}")

        # Special handling for Reddit URLs
        if parsed_url.netloc in (
            "reddit.com",
            "www.reddit.com",
            "old.reddit.com",
            "new.reddit.com",
        ):
            logger.debug(f"Reddit URL detected: {url}")
            # Reddit posts use og:image meta tag which will be extracted below
            # But we can add specific handling if needed in the future
            pass

        # Fetch the page to extract meta tags and images
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        }
        response = requests.get(url, headers=headers, timeout=10, allow_redirects=True)
        response.raise_for_status()

        html_content = response.text
        soup = BeautifulSoup(html_content, "html.parser")

        # Strategy 1: Try og:image meta tag
        og_image = soup.find("meta", property="og:image")
        if og_image and og_image.get("content"):
            image_url = urljoin(url, og_image["content"])
            logger.debug(f"Found og:image: {image_url}")
            _, image_data, content_type = _fetch_single_image(image_url)
            if image_data:
                return (image_data, content_type)

        # Strategy 2: Try twitter:image meta tag
        twitter_image = soup.find("meta", attrs={"name": "twitter:image"})
        if twitter_image and twitter_image.get("content"):
            image_url = urljoin(url, twitter_image["content"])
            logger.debug(f"Found twitter:image: {image_url}")
            _, image_data, content_type = _fetch_single_image(image_url)
            if image_data:
                return (image_data, content_type)

        # Strategy 3: Find meaningful images on the page (try multiple)
        # Collect candidate images first, then try them in order
        candidate_images = []
        for img in soup.find_all("img"):
            img_src = img.get("src") or img.get("data-src") or img.get("data-lazy-src")
            if not img_src:
                continue

            # Skip small images (likely icons/logos) unless this is a header image
            # Header images may have small width/height attributes but are still valid
            if not is_header_image:
                width = img.get("width")
                height = img.get("height")
                if width and height:
                    try:
                        if int(width) < 100 or int(height) < 100:
                            continue
                    except (ValueError, TypeError):
                        pass

            image_url = urljoin(url, img_src)
            candidate_images.append(image_url)

        # Try up to 5 candidate images (in case first ones fail validation)
        for idx, image_url in enumerate(candidate_images[:5]):
            logger.debug(
                f"Trying content image {idx + 1}/{min(len(candidate_images), 5)}: {image_url}"
            )
            _, image_data, content_type = _fetch_single_image(image_url)
            if image_data and len(image_data) > 5000:  # Skip very small images
                logger.debug(f"Successfully found valid image on attempt {idx + 1}")
                return (image_data, content_type)
            elif image_data:
                logger.debug(
                    f"Image too small ({len(image_data)} bytes), trying next candidate"
                )

        # Strategy 4: If no images found and this is a header image, try Playwright
        # (some pages load images via JavaScript)
        if is_header_image and len(candidate_images) == 0:
            logger.debug(
                f"No images found in initial HTML for {url}, trying Playwright fallback"
            )
            try:
                # Use Playwright to fetch the page and extract images from rendered HTML
                html_content = _fetch_html_with_playwright(url)
                if html_content:
                    soup = BeautifulSoup(html_content, "html.parser")

                    # Try og:image again (might be set by JavaScript)
                    og_image = soup.find("meta", property="og:image")
                    if og_image and og_image.get("content"):
                        image_url = urljoin(url, og_image["content"])
                        logger.debug(f"Found og:image via Playwright: {image_url}")
                        _, image_data, content_type = _fetch_single_image(image_url)
                        if image_data:
                            return (image_data, content_type)

                    # Try twitter:image again
                    twitter_image = soup.find("meta", attrs={"name": "twitter:image"})
                    if twitter_image and twitter_image.get("content"):
                        image_url = urljoin(url, twitter_image["content"])
                        logger.debug(f"Found twitter:image via Playwright: {image_url}")
                        _, image_data, content_type = _fetch_single_image(image_url)
                        if image_data:
                            return (image_data, content_type)

                    # Try to find images in rendered HTML
                    for img in soup.find_all("img"):
                        img_src = (
                            img.get("src")
                            or img.get("data-src")
                            or img.get("data-lazy-src")
                            or img.get("data-original")
                        )
                        if img_src:
                            image_url = urljoin(url, img_src)
                            logger.debug(
                                f"Trying image from Playwright-rendered HTML: {image_url}"
                            )
                            _, image_data, content_type = _fetch_single_image(image_url)
                            if image_data and len(image_data) > 5000:
                                logger.debug("Successfully found image via Playwright")
                                return (image_data, content_type)
            except Exception as e:
                logger.debug(f"Playwright fallback failed: {e}")

        logger.warning(
            f"No valid image found for URL: {url} (tried {len(candidate_images[:5])} candidates)"
        )
        return None

    except Exception as e:
        logger.warning(f"Failed to extract image from {url}: {e}")
        return None


# ============================================================================
# Fetch Mixin for BaseAggregator
# ============================================================================


class FetchMixin:
    """
    Mixin providing article fetching functionality for aggregators.

    This mixin provides the fetch_article_html method which can be overridden
    by aggregators to customize how article HTML is fetched from the web.
    """

    def fetch_article_html(self, article: "RawArticle") -> str:
        """
        Fetch the full HTML content of an article from the web.

        Override this to customize how articles are fetched (e.g., multi-page,
        special authentication, etc.)

        Args:
            article: The article to fetch

        Returns:
            Raw HTML content from the web page
        """
        return fetch_article_content(
            article.url,
            use_cache=not self.force_refresh,
            timeout=self.fetch_timeout,
            wait_for_selector=self.wait_for_selector,
        )
