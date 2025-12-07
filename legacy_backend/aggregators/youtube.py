"""
YouTube channel aggregator using YouTube Data API v3.

This module provides an aggregator for YouTube channels using the official
YouTube Data API v3 instead of RSS feeds or web scraping.

## Overview

The YouTube aggregator is an API-based aggregator that:
- Uses YouTube Data API v3 to fetch videos (no RSS feeds or web scraping)
- Resolves channel handles (@username) and channel IDs using API calls
- Fetches video metadata (thumbnails, descriptions, statistics, content details)
- Creates embedded video player content in articles
- Converts API responses to feedparser-like structure for BaseAggregator compatibility

## Configuration

**Required Environment Variable:**
- `YOUTUBE_API_KEY`: YouTube Data API v3 key
  - Get one at: https://console.cloud.google.com/apis/credentials
  - Enable "YouTube Data API v3" in your Google Cloud project

**Django Settings:**
- `YOUTUBE_API_KEY` is read from `settings.YOUTUBE_API_KEY`

## Usage

In Django admin:
- **Aggregator**: Select "youtube" from dropdown
- **Identifier**: Channel handle (e.g., `@mkbhd`) or channel ID (e.g., `UC...`)
- **Feed Type**: Select "youtube"

Supported identifier formats:
- `@mkbhd` or `mkbhd` (channel handle)
- `UCBJycsmduvYEL83R_U4JriQ` (channel ID, starts with UC)
- `https://www.youtube.com/@mkbhd` (full URL)
- `https://www.youtube.com/channel/UC...` (channel URL)

## Architecture

Unlike RSS-based aggregators, this aggregator:
1. Overrides `fetch_rss_feed()` to make API calls instead of parsing RSS
2. Uses `channels.list` to resolve channel identifiers
3. Uses `playlistItems.list` to get videos from channel's uploads playlist
4. Uses `videos.list` to get detailed video information
5. Converts API responses to feedparser-like entry dicts
6. Returns a mock feedparser object for BaseAggregator compatibility

The rest of the pipeline (parse_entry, process_article, save_article) works
the same as RSS-based aggregators.

## API Quota Considerations

YouTube Data API v3 has quota limits:
- Default quota: 10,000 units per day
- channels.list: 1 unit per request
- playlistItems.list: 1 unit per request
- videos.list: 1 unit per request

This aggregator makes:
- 1 request to resolve channel (if needed)
- 1 request to get uploads playlist ID
- 1+ requests to get playlist items (50 videos per request)
- 1 request per batch of videos for details

For a feed with 50 videos: ~3-4 API units per aggregation run.

## Error Handling

- `YouTubeAPIError`: Raised for API-related errors
- Missing API key: Raises `ValueError` with helpful message
- Invalid channel: Returns error message in validation
- API quota exceeded: HttpError from googleapiclient

## See Also

- `aggregators/base/aggregator.py`: BaseAggregator class
- `aggregators/reddit.py`: Another API-based aggregator example
- YouTube Data API v3 docs: https://developers.google.com/youtube/v3
"""

import logging
import re
from datetime import datetime
from typing import Any
from urllib.parse import parse_qs, urlparse

from django.conf import settings
from django.utils import timezone
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from pydantic import BaseModel, Field

from .base import BaseAggregator, RawArticle

logger = logging.getLogger(__name__)


class YouTubeAPIError(Exception):
    """Exception raised for YouTube API errors."""

    pass


def get_youtube_client():
    """
    Get a YouTube Data API v3 client.

    Creates and returns a YouTube API client using the API key from Django settings.
    The client is created fresh each time (no caching) to avoid stale connections.

    Returns:
        YouTube API client instance (googleapiclient.discovery.Resource)

    Raises:
        ValueError: If YOUTUBE_API_KEY is not configured in Django settings

    Example:
        ```python
        youtube = get_youtube_client()
        request = youtube.channels().list(part="id", forUsername="mkbhd")
        response = request.execute()
        ```
    """
    api_key = getattr(settings, "YOUTUBE_API_KEY", None)
    if not api_key:
        raise ValueError(
            "YouTube API key not configured. "
            "Please set YOUTUBE_API_KEY environment variable."
        )
    return build("youtube", "v3", developerKey=api_key)


def resolve_channel_id(identifier: str) -> tuple[str | None, str | None]:
    """
    Resolve a YouTube channel identifier to a channel ID using the API.

    This function handles various YouTube channel identifier formats and uses
    the YouTube Data API v3 to resolve them to a canonical channel ID (UC...).

    **Supported formats:**
    - Channel handle: `@mkbhd`, `mkbhd` (with or without @)
    - Channel ID: `UCBJycsmduvYEL83R_U4JriQ` (starts with UC, 24+ chars)
    - Full URL: `https://www.youtube.com/@mkbhd` or `https://www.youtube.com/channel/UC...`

    **Resolution process:**
    1. If identifier is already a channel ID (starts with UC), validates it via API
    2. If identifier is a URL, extracts handle or channel ID from path
    3. If identifier is a handle, uses `channels.list(forUsername=...)` API call
    4. Falls back to `search.list` if direct handle lookup fails

    Args:
        identifier: YouTube channel identifier in any supported format

    Returns:
        Tuple of (channel_id, error_message):
        - If successful: (channel_id, None) where channel_id starts with "UC"
        - If failed: (None, error_message) with descriptive error

    Raises:
        HttpError: If YouTube API request fails (network, quota, etc.)

    Example:
        ```python
        channel_id, error = resolve_channel_id("@mkbhd")
        if error:
            print(f"Error: {error}")
        else:
            print(f"Channel ID: {channel_id}")  # UC...
        ```
    """
    identifier = identifier.strip()

    if not identifier:
        return None, "Channel identifier is required"

    # If it starts with UC and is 24+ chars, assume it's already a channel ID
    if identifier.startswith("UC") and len(identifier) >= 24:
        # Validate it exists via API
        try:
            youtube = get_youtube_client()
            request = youtube.channels().list(part="id", id=identifier)
            response = request.execute()
            if response.get("items"):
                return identifier, None
            return None, f"Channel ID not found: {identifier}"
        except HttpError as e:
            logger.error(f"YouTube API error resolving channel ID: {e}")
            return None, f"API error: {str(e)}"
        except Exception as e:
            logger.error(f"Error resolving channel ID: {e}")
            return None, f"Error: {str(e)}"

    # Extract handle from URL if it's a URL
    handle = None
    if identifier.startswith(("http://", "https://", "youtube.com", "www.youtube.com")):
        if not identifier.startswith("http"):
            identifier = f"https://{identifier}"

        try:
            parsed = urlparse(identifier)
            path = parsed.path.strip("/")

            # Remove query parameters and fragments from path
            if "?" in path:
                path = path.split("?")[0]
            if "#" in path:
                path = path.split("#")[0]

            # Handle @username format (modern handles)
            if path.startswith("@"):
                handle = path[1:].split("/")[0]  # Remove @ and get first part
            # Handle /c/customname format
            elif path.startswith("c/") or path.startswith("user/"):
                handle = path.split("/")[1].split("?")[0].split("#")[0]
            # Handle /channel/UC... format
            elif path.startswith("channel/"):
                channel_id = path.split("/")[1].split("?")[0].split("#")[0]
                if channel_id.startswith("UC"):
                    return resolve_channel_id(channel_id)
            # Check query parameters for channel_id
            elif parsed.query:
                query_params = parse_qs(parsed.query)
                if "channel_id" in query_params:
                    channel_id = query_params["channel_id"][0]
                    if channel_id.startswith("UC"):
                        return resolve_channel_id(channel_id)
        except Exception as e:
            logger.error(f"Error parsing URL {identifier}: {e}")
            return None, f"Invalid URL format: {str(e)}"
    elif identifier.startswith("@"):
        handle = identifier[1:]  # Remove @
    else:
        # Assume it's a handle without @
        handle = identifier

    # Resolve handle to channel ID using API
    if handle:
        try:
            youtube = get_youtube_client()

            # For modern @handles, forUsername doesn't work. Use search.list instead.
            # Try searching with the handle (with @ prefix for better matching)
            search_query = f"@{handle}" if not handle.startswith("@") else handle

            # First, try searching for the exact handle
            search_request = youtube.search().list(
                part="snippet",
                q=search_query,
                type="channel",
                maxResults=10,  # Get more results to find the best match
            )
            search_response = search_request.execute()

            search_items = search_response.get("items", [])
            if search_items:
                # Normalize handle for comparison (remove @, lowercase)
                normalized_handle = handle.lower().lstrip("@")

                # Look for exact match by customUrl
                for item in search_items:
                    snippet = item.get("snippet", {})
                    custom_url = snippet.get("customUrl", "")
                    # Check if this is the exact match
                    if custom_url:
                        # customUrl can be "@handle" or "handle" or "youtube.com/@handle"
                        custom_url_normalized = (
                            custom_url.lower()
                            .lstrip("@")
                            .replace("youtube.com/", "")
                            .lstrip("/")
                        )
                        if custom_url_normalized == normalized_handle:
                            channel_id = item["id"]["channelId"]
                            logger.info(
                                f"Resolved handle @{handle} to channel ID {channel_id} via search (exact match by customUrl)"
                            )
                            return channel_id, None

                # Also check channel title for exact match (some channels don't have customUrl)
                for item in search_items:
                    snippet = item.get("snippet", {})
                    title = snippet.get("title", "").lower()
                    # Sometimes the handle is in the title
                    if normalized_handle in title or f"@{normalized_handle}" in title:
                        channel_id = item["id"]["channelId"]
                        logger.info(
                            f"Resolved handle @{handle} to channel ID {channel_id} via search (exact match by title)"
                        )
                        return channel_id, None

                # If no exact match, use the first result (most relevant)
                channel_id = search_items[0]["id"]["channelId"]
                logger.info(
                    f"Resolved handle @{handle} to channel ID {channel_id} via search (best match - first result)"
                )
                return channel_id, None

            # Fallback: Try forUsername for old-style usernames (deprecated but still works for some)
            # This is a last resort as it doesn't work for modern @handles
            try:
                request = youtube.channels().list(part="id", forUsername=handle)
                response = request.execute()
                items = response.get("items", [])
                if items:
                    channel_id = items[0]["id"]
                    logger.info(
                        f"Resolved handle @{handle} to channel ID {channel_id} via forUsername"
                    )
                    return channel_id, None
            except HttpError:
                # forUsername failed, which is expected for modern handles
                pass

            return None, f"Channel handle not found: @{handle}"
        except HttpError as e:
            logger.error(f"YouTube API error resolving handle @{handle}: {e}")
            return None, f"API error: {str(e)}"
        except Exception as e:
            logger.error(f"Error resolving handle @{handle}: {e}")
            return None, f"Error: {str(e)}"

    return None, "Could not parse channel identifier"


def validate_youtube_identifier(identifier: str) -> tuple[bool, str | None]:
    """
    Validate that a YouTube channel identifier is accessible via API.

    Args:
        identifier: YouTube channel identifier

    Returns:
        Tuple of (is_valid, error_message)
    """
    channel_id, error = resolve_channel_id(identifier)
    if error:
        return False, error
    return True, None


class YouTubeAggregatorConfig(BaseModel):
    id: str
    type: str = Field(pattern="^(managed|custom|social)$")
    name: str = Field(min_length=1)
    url: str = ""
    description: str = Field(min_length=1)
    wait_for_selector: str | None = None
    selectors_to_remove: list[str] = Field(default_factory=list)
    options: dict = Field(default_factory=dict)


class YouTubeAggregator(BaseAggregator):
    """
    Aggregator for YouTube channels using YouTube Data API v3.

    This aggregator fetches videos from YouTube channels using the official
    YouTube Data API v3 instead of RSS feeds or web scraping.
    """

    id = "youtube"
    type = "social"
    name = "YouTube Channel"
    url = ""
    description = (
        "Aggregator for YouTube channels using YouTube Data API v3. "
        "Requires YOUTUBE_API_KEY environment variable."
    )
    selectors_to_remove = []

    @property
    def identifier_type(self) -> str:
        return "string"

    @property
    def identifier_label(self) -> str:
        return "Channel"

    @property
    def identifier_description(self) -> str:
        return "Enter the YouTube channel handle (e.g., '@mkbhd'), channel ID (UC...), or channel URL."

    @property
    def identifier_placeholder(self) -> str:
        return "@mkbhd"

    @property
    def identifier_editable(self) -> bool:
        return True

    def __init__(self):
        super().__init__()
        YouTubeAggregatorConfig(
            id=self.id,
            type=self.type,
            name=self.name,
            url=self.url,
            description=self.description,
            wait_for_selector=self.wait_for_selector,
            selectors_to_remove=self.selectors_to_remove,
            options=self.options,
        )

    def validate_identifier(self, identifier: str) -> tuple[bool, str | None]:
        """Validate a YouTube channel identifier using the API."""
        return validate_youtube_identifier(identifier)

    def normalize_identifier(self, identifier: str) -> str:
        """
        Normalize a YouTube channel identifier to channel ID.

        Returns the channel ID (UC...) for consistent storage.
        """
        identifier = identifier.strip()
        if identifier.startswith("UC") and len(identifier) >= 24:
            return identifier
        channel_id, error = resolve_channel_id(identifier)
        if error:
            if identifier.startswith("@"):
                return identifier
            if "youtube.com" in identifier and "/@" in identifier:
                at_pos = identifier.find("/@")
                end_pos = identifier.find("/", at_pos + 2)
                if end_pos == -1:
                    end_pos = identifier.find("?", at_pos + 2)
                if end_pos == -1:
                    return identifier[at_pos + 1 :]
                return identifier[at_pos + 1 : end_pos]
            return identifier
        return channel_id

    def get_youtube_client(self):
        """Get YouTube API client."""
        return get_youtube_client()

    def fetch_rss_feed(self, feed_identifier: str) -> Any:
        """
        Fetch videos from YouTube channel using Data API v3.

        This method replaces the standard RSS feed fetching with YouTube Data API v3
        calls. It returns a feedparser-like structure to maintain compatibility with
        the BaseAggregator pipeline.

        **API calls made:**
        1. `channels.list(part="contentDetails", id=channel_id)` - Get uploads playlist ID
        2. `playlistItems.list(playlistId=uploads_playlist_id)` - Get video IDs from playlist
        3. `videos.list(part="snippet,statistics,contentDetails", id=video_ids)` - Get video details

        **Pagination:**
        - Fetches up to 50 videos per request (API limit)
        - Respects feed's `daily_post_limit` if set
        - Continues pagination until limit reached or no more videos

        **Return format:**
        Returns a mock feedparser object with `.entries` list. Each entry is a dict
        with keys: `title`, `link`, `published_parsed`, `summary`, `yt_videoid`, etc.
        See `_video_to_entry()` for full entry structure.

        Args:
            feed_identifier: The channel identifier (should be channel ID after normalization)

        Returns:
            Mock feedparser-like object with `.entries` list of video entries

        Raises:
            YouTubeAPIError: If API calls fail (channel not found, quota exceeded, etc.)
            ValueError: If channel identifier cannot be resolved

        Note:
            This method is called by BaseAggregator.aggregate() and should return
            a structure compatible with feedparser.FeedParserDict for the rest of
            the pipeline to work correctly.
        """
        # Get identifier from feed
        identifier = feed_identifier
        if self.feed:
            identifier = self.feed.identifier

        # Resolve to channel ID
        channel_id, error = resolve_channel_id(identifier)
        if error:
            self.logger.error(
                f"Could not resolve YouTube identifier '{identifier}': {error}"
            )
            raise ValueError(f"Invalid YouTube identifier: {error}")

        self.logger.info(f"Fetching videos for channel ID: {channel_id}")

        try:
            youtube = self.get_youtube_client()

            # Get channel's uploads playlist ID
            channel_request = youtube.channels().list(
                part="contentDetails", id=channel_id
            )
            channel_response = channel_request.execute()

            if not channel_response.get("items"):
                raise YouTubeAPIError(f"Channel not found: {channel_id}")

            channel_item = channel_response["items"][0]
            related_playlists = channel_item.get("contentDetails", {}).get(
                "relatedPlaylists", {}
            )
            uploads_playlist_id = related_playlists.get("uploads")

            if not uploads_playlist_id:
                # Channel has no uploads playlist (rare, but possible)
                self.logger.warning(
                    f"Channel {channel_id} has no uploads playlist. "
                    "Trying fallback method using search.list."
                )
                # Get max_results from feed settings if available
                max_results = 50
                if self.feed and hasattr(self.feed, "daily_post_limit"):
                    max_results = max(10, getattr(self.feed, "daily_post_limit", 50))
                videos = self._fetch_videos_via_search(
                    youtube, channel_id, max_results=max_results
                )
            else:
                # Get videos from uploads playlist
                videos = []
                next_page_token = None

                # Get max 50 videos (API limit per request)
                max_results = 50
                if self.feed and hasattr(self.feed, "daily_post_limit"):
                    # Respect daily limit if set, but fetch at least a few to check
                    max_results = max(10, getattr(self.feed, "daily_post_limit", 50))

                try:
                    while len(videos) < max_results:
                        playlist_request = youtube.playlistItems().list(
                            part="snippet,contentDetails",
                            playlistId=uploads_playlist_id,
                            maxResults=min(50, max_results - len(videos)),
                            pageToken=next_page_token,
                        )
                        playlist_response = playlist_request.execute()

                        items = playlist_response.get("items", [])
                        if not items:
                            break

                        # Get video IDs
                        video_ids = [
                            item["contentDetails"]["videoId"] for item in items
                        ]

                        # Get detailed video information
                        videos_request = youtube.videos().list(
                            part="snippet,statistics,contentDetails",
                            id=",".join(video_ids),
                        )
                        videos_response = videos_request.execute()

                        videos.extend(videos_response.get("items", []))
                        next_page_token = playlist_response.get("nextPageToken")
                        if not next_page_token:
                            break
                except HttpError as e:
                    # Handle playlist not found or inaccessible
                    error_details = str(e)
                    if "playlistNotFound" in error_details or e.resp.status == 404:
                        self.logger.warning(
                            f"Uploads playlist {uploads_playlist_id} not found or inaccessible. "
                            f"Trying fallback method using search.list. Error: {e}"
                        )
                        # Get max_results from feed settings if available
                        max_results = 50
                        if self.feed and hasattr(self.feed, "daily_post_limit"):
                            max_results = max(
                                10, getattr(self.feed, "daily_post_limit", 50)
                            )
                        videos = self._fetch_videos_via_search(
                            youtube, channel_id, max_results=max_results
                        )
                    else:
                        # Re-raise other HTTP errors
                        raise

            # Convert to feedparser-like structure
            class MockFeed:
                def __init__(self, entries):
                    self.entries = entries

            entries = []
            for video in videos:
                # Create entry-like object
                entry = self._video_to_entry(video)
                entries.append(entry)

            if not entries:
                self.logger.warning(
                    f"No videos found for channel {channel_id}. "
                    "Channel may have no public videos or may be private."
                )

            self.logger.info(
                f"Successfully fetched {len(entries)} video(s) for channel {channel_id}"
            )

            return MockFeed(entries)

        except HttpError as e:
            error_msg = f"YouTube API error: {e}"
            self.logger.error(error_msg)
            raise YouTubeAPIError(error_msg) from e
        except Exception as e:
            error_msg = f"Error fetching YouTube videos: {e}"
            self.logger.error(error_msg, exc_info=True)
            raise YouTubeAPIError(error_msg) from e

    def _fetch_videos_via_search(
        self, youtube: Any, channel_id: str, max_results: int = 50
    ) -> list[dict]:
        """
        Fallback method to fetch videos using search.list when uploads playlist is unavailable.

        This method uses search.list to find videos from a channel, which works even when
        the uploads playlist is not accessible or doesn't exist.

        Args:
            youtube: YouTube API client
            channel_id: Channel ID to fetch videos from
            max_results: Maximum number of videos to fetch

        Returns:
            List of video dicts from videos.list API
        """
        videos = []
        next_page_token = None

        try:
            while len(videos) < max_results:
                # Search for videos from this channel
                search_request = youtube.search().list(
                    part="id",
                    channelId=channel_id,
                    type="video",
                    order="date",  # Most recent first
                    maxResults=min(50, max_results - len(videos)),
                    pageToken=next_page_token,
                )
                search_response = search_request.execute()

                items = search_response.get("items", [])
                if not items:
                    break

                # Get video IDs from search results
                video_ids = [item["id"]["videoId"] for item in items]

                # Get detailed video information
                videos_request = youtube.videos().list(
                    part="snippet,statistics,contentDetails",
                    id=",".join(video_ids),
                )
                videos_response = videos_request.execute()

                videos.extend(videos_response.get("items", []))
                next_page_token = search_response.get("nextPageToken")
                if not next_page_token:
                    break

            self.logger.info(
                f"Fetched {len(videos)} videos via search.list for channel {channel_id}"
            )
            return videos

        except HttpError as e:
            error_details = str(e)
            # Check if it's a quota or permission error vs. channel not found
            if "quota" in error_details.lower() or e.resp.status == 403:
                self.logger.error(
                    f"API quota exceeded or permission denied when fetching videos "
                    f"via search.list for channel {channel_id}: {e}"
                )
            elif "notFound" in error_details.lower() or e.resp.status == 404:
                self.logger.warning(
                    f"Channel {channel_id} not found or has no public videos via search.list: {e}"
                )
            else:
                self.logger.error(
                    f"Error fetching videos via search.list for channel {channel_id}: {e}"
                )
            # Return empty list if search also fails
            return []

    def _video_to_entry(self, video: dict) -> dict:
        """
        Convert YouTube API video response to feedparser-like entry.

        This method transforms a YouTube Data API v3 video response into a dict
        that mimics a feedparser entry, allowing the rest of the BaseAggregator
        pipeline to work without modification.

        **Input format (YouTube API):**
        ```python
        {
            "id": "video_id",
            "snippet": {
                "title": "...",
                "description": "...",
                "publishedAt": "2023-01-01T12:00:00Z",
                "thumbnails": {...}
            },
            "statistics": {...},
            "contentDetails": {...}
        }
        ```

        **Output format (feedparser-like):**
        ```python
        {
            "title": "...",
            "link": "https://www.youtube.com/watch?v=...",
            "published_parsed": time.struct_time(...),
            "summary": "...",
            "yt_videoid": "...",
            "_youtube_video_id": "...",
            "_youtube_statistics": {...},
            ...
        }
        ```

        Args:
            video: Video dict from YouTube API `videos.list()` response

        Returns:
            Entry-like dict compatible with feedparser format, including:
            - Standard feedparser fields: `title`, `link`, `published_parsed`, `summary`
            - YouTube-specific fields: `yt_videoid`, `media_thumbnail`, `media_group`
            - Raw API data: `_youtube_video_id`, `_youtube_statistics`, `_youtube_snippet`
              (prefixed with `_` to avoid conflicts, used internally)

        Note:
            The `_youtube_*` fields store raw API data for later use in
            `fetch_article_html()` and `save_article()` methods.
        """
        snippet = video.get("snippet", {})
        video_id = video.get("id")
        statistics = video.get("statistics", {})
        content_details = video.get("contentDetails", {})

        # Build video URL
        video_url = f"https://www.youtube.com/watch?v={video_id}"

        # Parse published date
        published_str = snippet.get("publishedAt", "")
        published_parsed = None
        if published_str:
            try:
                # YouTube API returns ISO 8601 format (e.g., "2023-01-01T12:00:00Z")
                # Replace Z with +00:00 for fromisoformat compatibility
                if published_str.endswith("Z"):
                    published_str_parsed = published_str[:-1] + "+00:00"
                else:
                    published_str_parsed = published_str
                published_dt = datetime.fromisoformat(published_str_parsed)
                published_parsed = published_dt.timetuple()
            except (ValueError, AttributeError) as e:
                logger.warning(f"Failed to parse YouTube date '{published_str}': {e}")
                published_parsed = None

        # Get thumbnails
        thumbnails = snippet.get("thumbnails", {})
        thumbnail_url = ""
        if thumbnails:
            # Prefer high quality thumbnail
            for quality in ["maxres", "standard", "high", "medium", "default"]:
                if quality in thumbnails:
                    thumbnail_url = thumbnails[quality]["url"]
                    break

        # Build entry dict
        entry = {
            "title": snippet.get("title", "Untitled"),
            "link": video_url,
            "url": video_url,
            "published": published_str,
            "published_parsed": published_parsed,
            "updated": snippet.get("publishedAt", ""),
            "updated_parsed": published_parsed,
            "summary": snippet.get("description", ""),
            "description": snippet.get("description", ""),
            "yt_videoid": video_id,
            "media_thumbnail": [{"url": thumbnail_url}] if thumbnail_url else [],
            "media_group": {
                "media_thumbnail": [{"url": thumbnail_url}] if thumbnail_url else [],
                "media_description": snippet.get("description", ""),
            },
            # Store API data for later use
            "_youtube_video_id": video_id,
            "_youtube_statistics": statistics,
            "_youtube_content_details": content_details,
            "_youtube_snippet": snippet,
        }

        return entry

    def parse_entry(self, entry: Any) -> RawArticle:
        """
        Parse YouTube API entry into a RawArticle with video metadata.

        Args:
            entry: Entry-like dict from _video_to_entry

        Returns:
            RawArticle with parsed data
        """
        article = super().parse_entry(entry)

        # Video ID is already stored in entry
        video_id = entry.get("_youtube_video_id") or entry.get("yt_videoid")
        if video_id:
            entry["_youtube_video_id"] = video_id

        return article

    def _extract_video_id(self, entry: Any, url: str) -> str | None:
        """Extract YouTube video ID from entry or URL."""
        # Try from entry first
        video_id = entry.get("_youtube_video_id") or entry.get("yt_videoid")
        if video_id:
            return video_id

        # Fallback to extracting from URL
        match = re.search(r"(?:v=|youtu\.be/)([a-zA-Z0-9_-]{11})", url)
        if match:
            return match.group(1)

        return None

    def fetch_article_html(self, article: RawArticle) -> str:
        """
        Generate HTML content with embedded YouTube player.

        Instead of fetching from web, we generate content with:
        - Embedded YouTube player
        - Video description from API
        - Link to original video
        """
        entry = article.entry

        # Extract description from API data
        description = entry.get("description") or entry.get("summary", "")
        if not description:
            snippet = entry.get("_youtube_snippet", {})
            description = snippet.get("description", "")

        # Build HTML content
        html_parts = []

        # Note: Video embed is shown in template, not in content
        # This prevents duplicate embeds and thumbnail images

        # Description
        if description:
            # Convert newlines to paragraphs for better formatting
            paragraphs = description.split("\n\n")
            for para in paragraphs:
                para = para.strip()
                if para:
                    # Convert single newlines to <br>
                    para = para.replace("\n", "<br>")
                    html_parts.append(f"<p>{para}</p>")

        return "\n".join(html_parts)

    def _extract_thumbnail(self, entry: Any, video_id: str | None) -> str:
        """Extract thumbnail URL from entry or generate from video ID."""
        # Try media_thumbnail
        media_thumbnail = entry.get("media_thumbnail")
        if media_thumbnail and isinstance(media_thumbnail, list) and media_thumbnail:
            return media_thumbnail[0].get("url", "")

        # Try media_group/media_thumbnail
        media_group = entry.get("media_group", {})
        if isinstance(media_group, dict):
            thumbnails = media_group.get("media_thumbnail", [])
            if thumbnails and isinstance(thumbnails, list):
                return thumbnails[0].get("url", "")

        # Try snippet thumbnails
        snippet = entry.get("_youtube_snippet", {})
        if snippet:
            thumbnails = snippet.get("thumbnails", {})
            if thumbnails:
                for quality in ["maxres", "standard", "high", "medium", "default"]:
                    if quality in thumbnails:
                        return thumbnails[quality]["url"]

        # Generate from video ID (YouTube default thumbnail)
        if video_id:
            return f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg"

        return ""

    def _extract_description(self, entry: Any) -> str:
        """Extract video description from entry."""
        # Try description fields
        description = entry.get("description") or entry.get("summary", "")
        if description:
            return description

        # Try snippet
        snippet = entry.get("_youtube_snippet", {})
        if snippet:
            return snippet.get("description", "")

        return ""

    def extract_content(self, article: RawArticle) -> None:
        """Content is already extracted in fetch_article_html - no additional extraction needed."""
        pass

    def save_article(self, article: RawArticle, content: str) -> bool:
        """
        Save article with YouTube-specific metadata.

        Extracts and stores:
        - thumbnail_url: Video thumbnail
        - media_url: YouTube embed URL
        - Additional metadata from API (view count, duration available but not stored)
        """
        from core.models import Article

        entry = article.entry
        video_id = entry.get("_youtube_video_id") or self._extract_video_id(
            entry, article.url
        )

        # Extract metadata
        thumbnail_url = self._extract_thumbnail(entry, video_id)
        if video_id:
            from api.youtube import get_youtube_proxy_url

            embed_url = get_youtube_proxy_url(video_id)
        else:
            embed_url = ""

        # Use current timestamp if feed is configured for it (default: True)
        if self.feed and getattr(self.feed, "use_current_timestamp", True):
            article_date = timezone.now()
        else:
            article_date = article.date

        _, created = Article.objects.update_or_create(
            url=article.url,
            defaults={
                "feed": self.feed,
                "name": article.title,
                "date": article_date,
                "content": content,
                "thumbnail_url": thumbnail_url,
                "media_url": embed_url,
                "media_type": "video/youtube",
            },
        )

        if created:
            self.logger.info(f"Created YouTube video: {article.title}")

        return created


# Module-level wrapper for compatibility
def aggregate(feed, force_refresh=False, options=None):
    """Module-level wrapper for admin interface."""
    aggregator = YouTubeAggregator()
    return aggregator.aggregate(feed, force_refresh, options or {})
