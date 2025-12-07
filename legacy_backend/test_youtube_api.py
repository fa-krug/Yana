"""
Tests for YouTube aggregator using YouTube Data API v3.

This module tests the API-based YouTube aggregator implementation,
including channel resolution, API calls, video fetching, and error handling.
"""

from datetime import datetime
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from googleapiclient.errors import HttpError

from aggregators.youtube import (
    YouTubeAggregator,
    YouTubeAPIError,
    get_youtube_client,
    resolve_channel_id,
    validate_youtube_identifier,
)
from core.models import Article, Feed


class YouTubeAPIClientTests(TestCase):
    """Tests for YouTube API client creation."""

    @override_settings(YOUTUBE_API_KEY="test_api_key_123")
    @patch("aggregators.youtube.build")
    def test_get_youtube_client_success(self, mock_build: MagicMock) -> None:
        """Test successful YouTube API client creation."""
        mock_client = MagicMock()
        mock_build.return_value = mock_client

        client = get_youtube_client()

        mock_build.assert_called_once_with(
            "youtube", "v3", developerKey="test_api_key_123"
        )
        self.assertEqual(client, mock_client)

    @override_settings(YOUTUBE_API_KEY="")
    def test_get_youtube_client_missing_key(self) -> None:
        """Test that missing API key raises ValueError."""
        with self.assertRaises(ValueError) as cm:
            get_youtube_client()
        self.assertIn("YouTube API key not configured", str(cm.exception))

    @override_settings(YOUTUBE_API_KEY=None)
    def test_get_youtube_client_none_key(self) -> None:
        """Test that None API key raises ValueError."""
        with self.assertRaises(ValueError) as cm:
            get_youtube_client()
        self.assertIn("YouTube API key not configured", str(cm.exception))


class ResolveChannelIDTests(TestCase):
    """Tests for channel ID resolution."""

    @override_settings(YOUTUBE_API_KEY="test_api_key")
    @patch("aggregators.youtube.get_youtube_client")
    def test_resolve_channel_id_direct(self, mock_get_client: MagicMock) -> None:
        """Test resolving a direct channel ID."""
        mock_youtube = MagicMock()
        mock_get_client.return_value = mock_youtube

        # Mock channels.list response
        mock_channels = MagicMock()
        mock_channels.list.return_value.execute.return_value = {
            "items": [{"id": "UCtest123456789012345678"}]
        }
        mock_youtube.channels.return_value = mock_channels

        channel_id, error = resolve_channel_id("UCtest123456789012345678")

        self.assertIsNone(error)
        self.assertEqual(channel_id, "UCtest123456789012345678")
        mock_channels.list.assert_called_once_with(
            part="id", id="UCtest123456789012345678"
        )

    @override_settings(YOUTUBE_API_KEY="test_api_key")
    @patch("aggregators.youtube.get_youtube_client")
    def test_resolve_channel_id_not_found(self, mock_get_client: MagicMock) -> None:
        """Test resolving a non-existent channel ID."""
        mock_youtube = MagicMock()
        mock_get_client.return_value = mock_youtube

        # Mock channels.list response with no items
        mock_channels = MagicMock()
        mock_channels.list.return_value.execute.return_value = {"items": []}
        mock_youtube.channels.return_value = mock_channels

        channel_id, error = resolve_channel_id("UCnonexistent123456789012")

        self.assertIsNotNone(error)
        self.assertIsNone(channel_id)
        self.assertIn("not found", error.lower())

    @override_settings(YOUTUBE_API_KEY="test_api_key")
    @patch("aggregators.youtube.get_youtube_client")
    def test_resolve_channel_handle(self, mock_get_client: MagicMock) -> None:
        """Test resolving a channel handle (@username)."""
        mock_youtube = MagicMock()
        mock_get_client.return_value = mock_youtube

        # Mock search.list response for handle (search is tried first)
        mock_search = MagicMock()
        mock_search.list.return_value.execute.return_value = {
            "items": [
                {
                    "id": {"channelId": "UCHandleChannelID123456789"},
                    "snippet": {"customUrl": "@mkbhd", "title": "MKBHD"},
                }
            ]
        }
        mock_youtube.search.return_value = mock_search

        channel_id, error = resolve_channel_id("@mkbhd")

        self.assertIsNone(error)
        self.assertEqual(channel_id, "UCHandleChannelID123456789")
        mock_search.list.assert_called_once_with(
            part="snippet", q="@mkbhd", type="channel", maxResults=10
        )

    @override_settings(YOUTUBE_API_KEY="test_api_key")
    @patch("aggregators.youtube.get_youtube_client")
    def test_resolve_channel_handle_fallback_to_search(
        self, mock_get_client: MagicMock
    ) -> None:
        """Test resolving handle falls back to forUsername if search fails."""
        mock_youtube = MagicMock()
        mock_get_client.return_value = mock_youtube

        # Mock search.list with no items (search fails)
        mock_search = MagicMock()
        mock_search.list.return_value.execute.return_value = {"items": []}
        mock_youtube.search.return_value = mock_search

        # Mock channels.list as fallback (forUsername)
        mock_channels = MagicMock()
        mock_channels.list.return_value.execute.return_value = {
            "items": [{"id": "UCSearchChannelID123456789"}]
        }
        mock_youtube.channels.return_value = mock_channels

        channel_id, error = resolve_channel_id("@mkbhd")

        self.assertIsNone(error)
        self.assertEqual(channel_id, "UCSearchChannelID123456789")
        mock_search.list.assert_called_once()
        call_kwargs = mock_search.list.call_args[1]
        self.assertEqual(call_kwargs["q"], "@mkbhd")
        self.assertEqual(call_kwargs["type"], "channel")
        mock_channels.list.assert_called_once_with(part="id", forUsername="mkbhd")

    @override_settings(YOUTUBE_API_KEY="test_api_key")
    @patch("aggregators.youtube.get_youtube_client")
    def test_resolve_channel_url(self, mock_get_client: MagicMock) -> None:
        """Test resolving a full YouTube URL."""
        mock_youtube = MagicMock()
        mock_get_client.return_value = mock_youtube

        # Mock search.list response (URL extracts handle and uses search)
        mock_search = MagicMock()
        mock_search.list.return_value.execute.return_value = {
            "items": [
                {
                    "id": {"channelId": "UCURLChannelID123456789012"},
                    "snippet": {"customUrl": "@mkbhd", "title": "MKBHD"},
                }
            ]
        }
        mock_youtube.search.return_value = mock_search

        channel_id, error = resolve_channel_id("https://www.youtube.com/@mkbhd")

        self.assertIsNone(error)
        self.assertEqual(channel_id, "UCURLChannelID123456789012")

    @override_settings(YOUTUBE_API_KEY="test_api_key")
    @patch("aggregators.youtube.get_youtube_client")
    def test_resolve_channel_id_api_error(self, mock_get_client: MagicMock) -> None:
        """Test handling API errors during channel resolution."""
        mock_youtube = MagicMock()
        mock_get_client.return_value = mock_youtube

        # Mock API error - use a valid channel ID format (24+ chars starting with UC)
        # so it goes through the channel ID validation path
        mock_channels = MagicMock()
        mock_error = HttpError(
            MagicMock(status=403), b'{"error": {"message": "Quota exceeded"}}'
        )
        mock_channels.list.return_value.execute.side_effect = mock_error
        mock_youtube.channels.return_value = mock_channels

        channel_id, error = resolve_channel_id("UCtest123456789012345678")

        self.assertIsNotNone(error)
        self.assertIsNone(channel_id)
        self.assertIn("API error", error)

    def test_resolve_channel_id_empty(self) -> None:
        """Test resolving empty identifier."""
        channel_id, error = resolve_channel_id("")
        self.assertIsNotNone(error)
        self.assertIsNone(channel_id)
        self.assertIn("required", error.lower())


class ValidateYouTubeIdentifierTests(TestCase):
    """Tests for identifier validation."""

    @override_settings(YOUTUBE_API_KEY="test_api_key")
    @patch("aggregators.youtube.resolve_channel_id")
    def test_validate_identifier_success(self, mock_resolve: MagicMock) -> None:
        """Test successful identifier validation."""
        mock_resolve.return_value = ("UCtest123", None)

        is_valid, error = validate_youtube_identifier("@mkbhd")

        self.assertTrue(is_valid)
        self.assertIsNone(error)
        mock_resolve.assert_called_once_with("@mkbhd")

    @override_settings(YOUTUBE_API_KEY="test_api_key")
    @patch("aggregators.youtube.resolve_channel_id")
    def test_validate_identifier_failure(self, mock_resolve: MagicMock) -> None:
        """Test failed identifier validation."""
        mock_resolve.return_value = (None, "Channel not found")

        is_valid, error = validate_youtube_identifier("@nonexistent")

        self.assertFalse(is_valid)
        self.assertIsNotNone(error)
        self.assertEqual(error, "Channel not found")


class YouTubeAggregatorMetadataTests(TestCase):
    """Tests for YouTube aggregator metadata."""

    def setUp(self) -> None:
        """Set up test fixtures."""
        self.aggregator = YouTubeAggregator()

    def test_aggregator_id(self) -> None:
        """Test aggregator ID."""
        self.assertEqual(self.aggregator.id, "youtube")

    def test_aggregator_type(self) -> None:
        """Test aggregator type."""
        self.assertEqual(self.aggregator.type, "social")

    def test_aggregator_name(self) -> None:
        """Test aggregator name."""
        self.assertEqual(self.aggregator.name, "YouTube Channel")

    def test_aggregator_description(self) -> None:
        """Test aggregator description."""
        self.assertIn("YouTube", self.aggregator.description)
        self.assertIn("API", self.aggregator.description)

    def test_identifier_type(self) -> None:
        """Test identifier type."""
        self.assertEqual(self.aggregator.identifier_type, "string")

    def test_identifier_label(self) -> None:
        """Test identifier label."""
        self.assertEqual(self.aggregator.identifier_label, "Channel")

    def test_identifier_placeholder(self) -> None:
        """Test identifier placeholder."""
        self.assertEqual(self.aggregator.identifier_placeholder, "@mkbhd")


class YouTubeAggregatorNormalizeTests(TestCase):
    """Tests for identifier normalization."""

    def setUp(self) -> None:
        """Set up test fixtures."""
        self.aggregator = YouTubeAggregator()

    def test_normalize_channel_id(self) -> None:
        """Test normalizing a channel ID."""
        identifier = "UCtest123456789012345678"
        result = self.aggregator.normalize_identifier(identifier)
        self.assertEqual(result, identifier)

    @patch("aggregators.youtube.resolve_channel_id")
    def test_normalize_handle(self, mock_resolve: MagicMock) -> None:
        """Test normalizing a handle."""
        mock_resolve.return_value = ("UCresolved123", None)

        result = self.aggregator.normalize_identifier("@mkbhd")

        self.assertEqual(result, "UCresolved123")
        mock_resolve.assert_called_once_with("@mkbhd")

    @patch("aggregators.youtube.resolve_channel_id")
    def test_normalize_handle_failure(self, mock_resolve: MagicMock) -> None:
        """Test normalizing handle when resolution fails."""
        mock_resolve.return_value = (None, "Error")

        result = self.aggregator.normalize_identifier("@mkbhd")

        # Should return original identifier if resolution fails
        self.assertEqual(result, "@mkbhd")


class YouTubeAggregatorFetchTests(TestCase):
    """Tests for YouTube feed fetching."""

    def setUp(self) -> None:
        """Set up test fixtures."""
        User = get_user_model()
        self.user = User.objects.create_user(
            username="testuser", email="test@example.com", password="testpass"
        )
        self.feed = Feed.objects.create(
            name="Test YouTube Channel",
            identifier="UCtest123456789012345678",
            feed_type="youtube",
            aggregator="youtube",
            user=self.user,
        )
        self.aggregator = YouTubeAggregator()
        self.aggregator.feed = self.feed

    @override_settings(YOUTUBE_API_KEY="test_api_key")
    @patch("aggregators.youtube.get_youtube_client")
    def test_fetch_rss_feed_success(self, mock_get_client: MagicMock) -> None:
        """Test successful feed fetching."""
        mock_youtube = MagicMock()
        mock_get_client.return_value = mock_youtube

        # Mock channels.list to get uploads playlist
        mock_channels = MagicMock()
        mock_channels.list.return_value.execute.return_value = {
            "items": [
                {
                    "contentDetails": {
                        "relatedPlaylists": {"uploads": "UUtest123456789012345678"}
                    }
                }
            ]
        }
        mock_youtube.channels.return_value = mock_channels

        # Mock playlistItems.list
        mock_playlist = MagicMock()
        mock_playlist.list.return_value.execute.return_value = {
            "items": [
                {
                    "contentDetails": {"videoId": "video1"},
                    "snippet": {"title": "Video 1"},
                },
                {
                    "contentDetails": {"videoId": "video2"},
                    "snippet": {"title": "Video 2"},
                },
            ],
            "nextPageToken": None,
        }
        mock_youtube.playlistItems.return_value = mock_playlist

        # Mock videos.list
        mock_videos = MagicMock()
        mock_videos.list.return_value.execute.return_value = {
            "items": [
                {
                    "id": "video1",
                    "snippet": {
                        "title": "Test Video 1",
                        "description": "Description 1",
                        "publishedAt": "2023-01-01T12:00:00Z",
                        "thumbnails": {
                            "high": {"url": "https://example.com/thumb1.jpg"}
                        },
                    },
                    "statistics": {"viewCount": "1000"},
                    "contentDetails": {"duration": "PT5M30S"},
                },
                {
                    "id": "video2",
                    "snippet": {
                        "title": "Test Video 2",
                        "description": "Description 2",
                        "publishedAt": "2023-01-02T12:00:00Z",
                        "thumbnails": {
                            "high": {"url": "https://example.com/thumb2.jpg"}
                        },
                    },
                    "statistics": {"viewCount": "2000"},
                    "contentDetails": {"duration": "PT10M"},
                },
            ]
        }
        mock_youtube.videos.return_value = mock_videos

        # Mock resolve_channel_id
        with patch("aggregators.youtube.resolve_channel_id") as mock_resolve:
            mock_resolve.return_value = ("UCtest123456789012345678", None)

            feed = self.aggregator.fetch_rss_feed("UCtest123456789012345678")

            self.assertIsNotNone(feed)
            self.assertTrue(hasattr(feed, "entries"))
            self.assertEqual(len(feed.entries), 2)

            # Check first entry
            entry1 = feed.entries[0]
            self.assertEqual(entry1["title"], "Test Video 1")
            self.assertEqual(entry1["yt_videoid"], "video1")
            self.assertIn("_youtube_video_id", entry1)
            self.assertEqual(entry1["_youtube_video_id"], "video1")

    @override_settings(YOUTUBE_API_KEY="test_api_key")
    @patch("aggregators.youtube.get_youtube_client")
    def test_fetch_rss_feed_no_uploads_playlist(
        self, mock_get_client: MagicMock
    ) -> None:
        """Test feed fetching when channel has no uploads playlist."""
        mock_youtube = MagicMock()
        mock_get_client.return_value = mock_youtube

        # Mock channels.list with no uploads playlist
        mock_channels = MagicMock()
        mock_channels.list.return_value.execute.return_value = {
            "items": [
                {
                    "contentDetails": {
                        "relatedPlaylists": {}  # No uploads playlist
                    }
                }
            ]
        }
        mock_youtube.channels.return_value = mock_channels

        # Mock search.list as fallback
        mock_search = MagicMock()
        mock_search.list.return_value.execute.return_value = {
            "items": [{"id": {"videoId": "video1"}}],
            "nextPageToken": None,
        }
        mock_youtube.search.return_value = mock_search

        # Mock videos.list
        mock_videos = MagicMock()
        mock_videos.list.return_value.execute.return_value = {
            "items": [
                {
                    "id": "video1",
                    "snippet": {
                        "title": "Test Video",
                        "description": "Test",
                        "publishedAt": "2023-01-01T12:00:00Z",
                        "thumbnails": {},
                    },
                    "statistics": {},
                    "contentDetails": {},
                }
            ]
        }
        mock_youtube.videos.return_value = mock_videos

        with patch("aggregators.youtube.resolve_channel_id") as mock_resolve:
            mock_resolve.return_value = ("UCtest123", None)

            feed = self.aggregator.fetch_rss_feed("UCtest123")

            # Should use search fallback
            self.assertIsNotNone(feed)
            self.assertTrue(hasattr(feed, "entries"))
            mock_search.list.assert_called_once()

    @override_settings(YOUTUBE_API_KEY="test_api_key")
    @patch("aggregators.youtube.get_youtube_client")
    def test_fetch_rss_feed_playlist_not_found_fallback(
        self, mock_get_client: MagicMock
    ) -> None:
        """Test feed fetching when uploads playlist is not found, falls back to search."""
        mock_youtube = MagicMock()
        mock_get_client.return_value = mock_youtube

        # Mock channels.list
        mock_channels = MagicMock()
        mock_channels.list.return_value.execute.return_value = {
            "items": [
                {"contentDetails": {"relatedPlaylists": {"uploads": "UUtest123"}}}
            ]
        }
        mock_youtube.channels.return_value = mock_channels

        # Mock playlistItems.list to raise 404
        mock_playlist = MagicMock()
        from googleapiclient.errors import HttpError

        mock_error = HttpError(
            MagicMock(status=404),
            b'{"error": {"message": "playlistNotFound", "errors": [{"reason": "playlistNotFound"}]}}',
        )
        mock_playlist.list.return_value.execute.side_effect = mock_error
        mock_youtube.playlistItems.return_value = mock_playlist

        # Mock search.list as fallback
        mock_search = MagicMock()
        mock_search.list.return_value.execute.return_value = {
            "items": [{"id": {"videoId": "video1"}}],
            "nextPageToken": None,
        }
        mock_youtube.search.return_value = mock_search

        # Mock videos.list
        mock_videos = MagicMock()
        mock_videos.list.return_value.execute.return_value = {
            "items": [
                {
                    "id": "video1",
                    "snippet": {
                        "title": "Test Video",
                        "description": "Test",
                        "publishedAt": "2023-01-01T12:00:00Z",
                        "thumbnails": {},
                    },
                    "statistics": {},
                    "contentDetails": {},
                }
            ]
        }
        mock_youtube.videos.return_value = mock_videos

        with patch("aggregators.youtube.resolve_channel_id") as mock_resolve:
            mock_resolve.return_value = ("UCtest123", None)

            feed = self.aggregator.fetch_rss_feed("UCtest123")

            # Should use search fallback after playlist error
            self.assertIsNotNone(feed)
            self.assertTrue(hasattr(feed, "entries"))
            mock_search.list.assert_called_once()

    @override_settings(YOUTUBE_API_KEY="test_api_key")
    @patch("aggregators.youtube.get_youtube_client")
    def test_fetch_rss_feed_channel_not_found(self, mock_get_client: MagicMock) -> None:
        """Test feed fetching when channel is not found."""
        mock_youtube = MagicMock()
        mock_get_client.return_value = mock_youtube

        # Mock channels.list with no items
        mock_channels = MagicMock()
        mock_channels.list.return_value.execute.return_value = {"items": []}
        mock_youtube.channels.return_value = mock_channels

        with patch("aggregators.youtube.resolve_channel_id") as mock_resolve:
            mock_resolve.return_value = ("UCtest123", None)

            with self.assertRaises(YouTubeAPIError) as cm:
                self.aggregator.fetch_rss_feed("UCtest123")

            self.assertIn("not found", str(cm.exception).lower())

    @override_settings(YOUTUBE_API_KEY="test_api_key")
    @patch("aggregators.youtube.get_youtube_client")
    def test_fetch_rss_feed_api_error(self, mock_get_client: MagicMock) -> None:
        """Test feed fetching when API error occurs."""
        mock_youtube = MagicMock()
        mock_get_client.return_value = mock_youtube

        # Mock API error
        mock_channels = MagicMock()
        mock_error = HttpError(
            MagicMock(status=403), b'{"error": {"message": "Quota exceeded"}}'
        )
        mock_channels.list.return_value.execute.side_effect = mock_error
        mock_youtube.channels.return_value = mock_channels

        with patch("aggregators.youtube.resolve_channel_id") as mock_resolve:
            mock_resolve.return_value = ("UCtest123", None)

            with self.assertRaises(YouTubeAPIError) as cm:
                self.aggregator.fetch_rss_feed("UCtest123")

            self.assertIn("API error", str(cm.exception))


class YouTubeFetchVideosViaSearchTests(TestCase):
    """Tests for the fallback search method."""

    def setUp(self) -> None:
        """Set up test fixtures."""
        User = get_user_model()
        self.user = User.objects.create_user(
            username="testuser", email="test@example.com", password="testpass"
        )
        self.feed = Feed.objects.create(
            name="Test YouTube Channel",
            identifier="UCtest123",
            feed_type="youtube",
            aggregator="youtube",
            user=self.user,
        )
        self.aggregator = YouTubeAggregator()
        self.aggregator.feed = self.feed

    @override_settings(YOUTUBE_API_KEY="test_api_key")
    @patch("aggregators.youtube.get_youtube_client")
    def test_fetch_videos_via_search_success(self, mock_get_client: MagicMock) -> None:
        """Test successful video fetching via search.list."""
        mock_youtube = MagicMock()
        mock_get_client.return_value = mock_youtube

        # Mock search.list
        mock_search = MagicMock()
        mock_search.list.return_value.execute.return_value = {
            "items": [
                {"id": {"videoId": "video1"}},
                {"id": {"videoId": "video2"}},
            ],
            "nextPageToken": None,
        }
        mock_youtube.search.return_value = mock_search

        # Mock videos.list
        mock_videos = MagicMock()
        mock_videos.list.return_value.execute.return_value = {
            "items": [
                {
                    "id": "video1",
                    "snippet": {
                        "title": "Video 1",
                        "description": "",
                        "publishedAt": "2023-01-01T12:00:00Z",
                        "thumbnails": {},
                    },
                    "statistics": {},
                    "contentDetails": {},
                },
                {
                    "id": "video2",
                    "snippet": {
                        "title": "Video 2",
                        "description": "",
                        "publishedAt": "2023-01-02T12:00:00Z",
                        "thumbnails": {},
                    },
                    "statistics": {},
                    "contentDetails": {},
                },
            ]
        }
        mock_youtube.videos.return_value = mock_videos

        videos = self.aggregator._fetch_videos_via_search(
            mock_youtube, "UCtest123", max_results=50
        )

        self.assertEqual(len(videos), 2)
        self.assertEqual(videos[0]["id"], "video1")
        self.assertEqual(videos[1]["id"], "video2")

        # Verify search was called with correct parameters
        mock_search.list.assert_called_once()
        call_kwargs = mock_search.list.call_args[1]
        self.assertEqual(call_kwargs["channelId"], "UCtest123")
        self.assertEqual(call_kwargs["type"], "video")
        self.assertEqual(call_kwargs["order"], "date")

    @override_settings(YOUTUBE_API_KEY="test_api_key")
    @patch("aggregators.youtube.get_youtube_client")
    def test_fetch_videos_via_search_api_error(
        self, mock_get_client: MagicMock
    ) -> None:
        """Test handling API errors in search fallback."""
        mock_youtube = MagicMock()
        mock_get_client.return_value = mock_youtube

        # Mock search.list to raise error
        mock_search = MagicMock()
        mock_error = HttpError(
            MagicMock(status=403), b'{"error": {"message": "Quota exceeded"}}'
        )
        mock_search.list.return_value.execute.side_effect = mock_error
        mock_youtube.search.return_value = mock_search

        videos = self.aggregator._fetch_videos_via_search(
            mock_youtube, "UCtest123", max_results=50
        )

        # Should return empty list on error
        self.assertEqual(len(videos), 0)


class YouTubeVideoToEntryTests(TestCase):
    """Tests for video to entry conversion."""

    def setUp(self) -> None:
        """Set up test fixtures."""
        self.aggregator = YouTubeAggregator()

    def test_video_to_entry_basic(self) -> None:
        """Test converting a basic video to entry."""
        video = {
            "id": "test_video_id",
            "snippet": {
                "title": "Test Video",
                "description": "Test description",
                "publishedAt": "2023-01-01T12:00:00Z",
                "thumbnails": {"high": {"url": "https://example.com/thumb.jpg"}},
            },
            "statistics": {"viewCount": "1000"},
            "contentDetails": {"duration": "PT5M30S"},
        }

        entry = self.aggregator._video_to_entry(video)

        self.assertEqual(entry["title"], "Test Video")
        self.assertEqual(entry["yt_videoid"], "test_video_id")
        self.assertEqual(entry["_youtube_video_id"], "test_video_id")
        self.assertEqual(entry["description"], "Test description")
        self.assertIn("https://www.youtube.com/watch?v=test_video_id", entry["link"])
        self.assertIsNotNone(entry["published_parsed"])

    def test_video_to_entry_thumbnail_preference(self) -> None:
        """Test thumbnail quality preference."""
        video = {
            "id": "test_video_id",
            "snippet": {
                "title": "Test",
                "description": "",
                "publishedAt": "2023-01-01T12:00:00Z",
                "thumbnails": {
                    "default": {"url": "https://example.com/default.jpg"},
                    "medium": {"url": "https://example.com/medium.jpg"},
                    "high": {"url": "https://example.com/high.jpg"},
                    "maxres": {"url": "https://example.com/maxres.jpg"},
                },
            },
            "statistics": {},
            "contentDetails": {},
        }

        entry = self.aggregator._video_to_entry(video)

        # Should prefer maxres over others
        self.assertEqual(
            entry["media_thumbnail"][0]["url"], "https://example.com/maxres.jpg"
        )

    def test_video_to_entry_no_thumbnail(self) -> None:
        """Test entry with no thumbnail."""
        video = {
            "id": "test_video_id",
            "snippet": {
                "title": "Test",
                "description": "",
                "publishedAt": "2023-01-01T12:00:00Z",
                "thumbnails": {},
            },
            "statistics": {},
            "contentDetails": {},
        }

        entry = self.aggregator._video_to_entry(video)

        # Should have empty thumbnail list
        self.assertEqual(entry["media_thumbnail"], [])


class YouTubeAggregatorParseEntryTests(TestCase):
    """Tests for entry parsing."""

    def setUp(self) -> None:
        """Set up test fixtures."""
        self.aggregator = YouTubeAggregator()

    def test_parse_entry(self) -> None:
        """Test parsing an entry."""
        entry = {
            "title": "Test Video",
            "link": "https://www.youtube.com/watch?v=test123",
            "published_parsed": datetime(2023, 1, 1, 12, 0, 0).timetuple(),
            "summary": "Test description",
            "_youtube_video_id": "test123",
        }

        article = self.aggregator.parse_entry(entry)

        self.assertEqual(article.title, "Test Video")
        self.assertEqual(article.url, "https://www.youtube.com/watch?v=test123")
        self.assertEqual(article.entry["_youtube_video_id"], "test123")


class YouTubeAggregatorHTMLTests(TestCase):
    """Tests for HTML generation."""

    def setUp(self) -> None:
        """Set up test fixtures."""
        self.aggregator = YouTubeAggregator()

    def test_fetch_article_html_with_video(self) -> None:
        """Test HTML generation with video ID."""
        from aggregators.base.models import RawArticle

        entry = {
            "_youtube_video_id": "testVideo123",
            "description": "Test video description\n\nSecond paragraph",
        }
        article = RawArticle(
            url="https://youtube.com/watch?v=testVideo123",
            title="Test Video",
            date=datetime.now(),
            content="",
            entry=entry,
        )

        html = self.aggregator.fetch_article_html(article)

        # Note: Video embed is shown in template, not in content
        # This prevents duplicate embeds and thumbnail images
        # Check for description only
        self.assertIn("Test video description", html)
        self.assertIn("Second paragraph", html)
        self.assertIn("<p>", html)

    def test_fetch_article_html_no_video_id(self) -> None:
        """Test HTML generation without video ID."""
        from aggregators.base.models import RawArticle

        entry = {"description": "Test description"}
        article = RawArticle(
            url="https://youtube.com/watch",
            title="Test Video",
            date=datetime.now(),
            content="",
            entry=entry,
        )

        html = self.aggregator.fetch_article_html(article)

        # Should not have iframe
        self.assertNotIn("iframe", html)
        # But should have description if available
        self.assertIn("Test description", html)


class YouTubeAggregatorThumbnailTests(TestCase):
    """Tests for thumbnail extraction."""

    def setUp(self) -> None:
        """Set up test fixtures."""
        self.aggregator = YouTubeAggregator()

    def test_extract_thumbnail_from_media_thumbnail(self) -> None:
        """Test extracting thumbnail from media_thumbnail."""
        entry = {
            "media_thumbnail": [{"url": "https://example.com/thumb.jpg"}],
            "_youtube_video_id": "test123",
        }

        thumbnail = self.aggregator._extract_thumbnail(entry, "test123")

        self.assertEqual(thumbnail, "https://example.com/thumb.jpg")

    def test_extract_thumbnail_from_snippet(self) -> None:
        """Test extracting thumbnail from snippet."""
        entry = {
            "_youtube_snippet": {
                "thumbnails": {"high": {"url": "https://example.com/high.jpg"}}
            },
            "_youtube_video_id": "test123",
        }

        thumbnail = self.aggregator._extract_thumbnail(entry, "test123")

        self.assertEqual(thumbnail, "https://example.com/high.jpg")

    def test_extract_thumbnail_fallback_to_video_id(self) -> None:
        """Test fallback to generated thumbnail URL."""
        entry = {"_youtube_video_id": "test123"}

        thumbnail = self.aggregator._extract_thumbnail(entry, "test123")

        self.assertIn("test123", thumbnail)
        self.assertIn("ytimg.com", thumbnail)


class YouTubeAggregatorSaveArticleTests(TestCase):
    """Tests for article saving."""

    def setUp(self) -> None:
        """Set up test fixtures."""
        User = get_user_model()
        self.user = User.objects.create_user(
            username="testuser", email="test@example.com", password="testpass"
        )
        self.feed = Feed.objects.create(
            name="Test YouTube Channel",
            identifier="UCtest123",
            feed_type="youtube",
            aggregator="youtube",
            user=self.user,
        )
        self.aggregator = YouTubeAggregator()
        self.aggregator.feed = self.feed

    def test_save_article_creates_new(self) -> None:
        """Test saving a new article."""
        from aggregators.base.models import RawArticle

        entry = {
            "_youtube_video_id": "test123",
            "media_thumbnail": [{"url": "https://example.com/thumb.jpg"}],
        }
        article = RawArticle(
            url="https://www.youtube.com/watch?v=test123",
            title="Test Video",
            date=timezone.now(),
            content="<p>Test content</p>",
            entry=entry,
        )

        created = self.aggregator.save_article(article, "<p>Test content</p>")

        self.assertTrue(created)
        saved_article = Article.objects.get(url=article.url)
        self.assertEqual(saved_article.name, "Test Video")
        self.assertEqual(saved_article.thumbnail_url, "https://example.com/thumb.jpg")
        # Should use proxy URL format
        self.assertEqual(
            saved_article.media_url, "http://localhost:8000/api/youtube-proxy?v=test123"
        )
        self.assertEqual(saved_article.media_type, "video/youtube")

    def test_save_article_updates_existing(self) -> None:
        """Test updating an existing article."""
        from aggregators.base.models import RawArticle

        # Create existing article
        existing = Article.objects.create(
            feed=self.feed,
            name="Old Title",
            url="https://www.youtube.com/watch?v=test123",
            content="<p>Old content</p>",
        )

        entry = {
            "_youtube_video_id": "test123",
            "media_thumbnail": [{"url": "https://example.com/new_thumb.jpg"}],
        }
        article = RawArticle(
            url="https://www.youtube.com/watch?v=test123",
            title="New Title",
            date=timezone.now(),
            content="<p>New content</p>",
            entry=entry,
        )

        created = self.aggregator.save_article(article, "<p>New content</p>")

        self.assertFalse(created)
        existing.refresh_from_db()
        self.assertEqual(existing.name, "New Title")
        self.assertEqual(existing.content, "<p>New content</p>")


class YouTubeAggregatorIntegrationTests(TestCase):
    """Integration tests for YouTube aggregator."""

    def setUp(self) -> None:
        """Set up test fixtures."""
        User = get_user_model()
        self.user = User.objects.create_user(
            username="testuser", email="test@example.com", password="testpass"
        )
        self.feed = Feed.objects.create(
            name="Test YouTube Channel",
            identifier="UCtest123456789012345678",
            feed_type="youtube",
            aggregator="youtube",
            user=self.user,
        )

    @override_settings(YOUTUBE_API_KEY="test_api_key")
    @patch("aggregators.youtube.get_youtube_client")
    def test_full_aggregation_flow(self, mock_get_client: MagicMock) -> None:
        """Test the full aggregation flow from start to finish."""
        mock_youtube = MagicMock()
        mock_get_client.return_value = mock_youtube

        # Mock channels.list - needs to handle both validation (part="id") and content (part="contentDetails")
        mock_channels = MagicMock()

        def channels_list_side_effect(**kwargs):
            mock_request = MagicMock()
            if kwargs.get("part") == "id":
                # Validation call
                mock_request.execute.return_value = {
                    "items": [{"id": "UCtest123456789012345678"}]
                }
            else:
                # Content call
                mock_request.execute.return_value = {
                    "items": [
                        {
                            "contentDetails": {
                                "relatedPlaylists": {
                                    "uploads": "UUtest123456789012345678"
                                }
                            }
                        }
                    ]
                }
            return mock_request

        mock_channels.list.side_effect = channels_list_side_effect
        mock_youtube.channels.return_value = mock_channels

        # Mock playlistItems.list
        mock_playlist = MagicMock()
        mock_playlist.list.return_value.execute.return_value = {
            "items": [
                {
                    "contentDetails": {"videoId": "video1"},
                    "snippet": {"title": "Video 1"},
                }
            ],
            "nextPageToken": None,
        }
        mock_youtube.playlistItems.return_value = mock_playlist

        # Mock videos.list - use a recent date so it's not filtered as too old
        from datetime import UTC, datetime

        recent_date = datetime.now(UTC).isoformat().replace("+00:00", "Z")
        mock_videos = MagicMock()
        mock_videos.list.return_value.execute.return_value = {
            "items": [
                {
                    "id": "video1",
                    "snippet": {
                        "title": "Test Video",
                        "description": "Test description",
                        "publishedAt": recent_date,
                        "thumbnails": {
                            "high": {"url": "https://example.com/thumb.jpg"}
                        },
                    },
                    "statistics": {},
                    "contentDetails": {},
                }
            ]
        }
        mock_youtube.videos.return_value = mock_videos

        aggregator = YouTubeAggregator()
        aggregator.feed = self.feed
        new_count = aggregator.aggregate(self.feed, force_refresh=False)

        # Should create one article
        self.assertEqual(new_count, 1)
        article = Article.objects.get(feed=self.feed)
        self.assertEqual(article.name, "Test Video")
        self.assertEqual(article.media_type, "video/youtube")
