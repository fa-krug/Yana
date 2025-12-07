"""
Tests for YouTube and Podcast aggregation.

This module tests:
- YouTube RSS feed parsing and video metadata extraction
- Podcast RSS feed parsing and audio metadata extraction
- Feed type detection and filtering
- Article media fields
"""

import unittest
from datetime import datetime
from unittest.mock import MagicMock

from django.contrib.auth import get_user_model
from django.test import TestCase

from aggregators.podcast import PodcastAggregator, parse_duration_to_seconds
from aggregators.youtube import YouTubeAggregator
from core.models import Article, Feed


class DurationParsingTests(unittest.TestCase):
    """Test podcast duration parsing."""

    def test_parse_duration_hhmmss(self):
        """Test parsing HH:MM:SS format."""
        self.assertEqual(parse_duration_to_seconds("01:23:45"), 5025)
        self.assertEqual(parse_duration_to_seconds("00:00:30"), 30)
        self.assertEqual(parse_duration_to_seconds("02:00:00"), 7200)

    def test_parse_duration_mmss(self):
        """Test parsing MM:SS format."""
        self.assertEqual(parse_duration_to_seconds("23:45"), 1425)
        self.assertEqual(parse_duration_to_seconds("00:30"), 30)
        self.assertEqual(parse_duration_to_seconds("59:59"), 3599)

    def test_parse_duration_seconds_only(self):
        """Test parsing seconds-only format."""
        self.assertEqual(parse_duration_to_seconds("1234"), 1234)
        self.assertEqual(parse_duration_to_seconds("60"), 60)

    def test_parse_duration_empty(self):
        """Test parsing empty/None duration."""
        self.assertIsNone(parse_duration_to_seconds(""))
        self.assertIsNone(parse_duration_to_seconds(None))

    def test_parse_duration_invalid(self):
        """Test parsing invalid duration."""
        self.assertIsNone(parse_duration_to_seconds("invalid"))
        self.assertIsNone(parse_duration_to_seconds("1:2:3:4"))


class YouTubeAggregatorTests(TestCase):
    """Test YouTube aggregator functionality."""

    def setUp(self):
        """Set up test fixtures."""
        User = get_user_model()
        self.user = User.objects.create_user(
            username="testuser", email="test@example.com", password="testpass"
        )
        self.feed = Feed.objects.create(
            name="Test YouTube Channel",
            identifier="https://www.youtube.com/feeds/videos.xml?channel_id=UCtest123",
            feed_type="youtube",
            aggregator="youtube",
            user=self.user,
        )
        self.aggregator = YouTubeAggregator()

    def test_aggregator_metadata(self):
        """Test aggregator has correct metadata."""
        self.assertEqual(self.aggregator.id, "youtube")
        self.assertEqual(self.aggregator.type, "social")
        self.assertEqual(self.aggregator.name, "YouTube Channel")
        self.assertIn("YouTube", self.aggregator.description)

    def test_extract_video_id_from_url(self):
        """Test video ID extraction from various URL formats."""
        entry = MagicMock()
        entry.get.return_value = None

        # Standard watch URL
        video_id = self.aggregator._extract_video_id(
            entry, "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        )
        self.assertEqual(video_id, "dQw4w9WgXcQ")

        # Short URL
        video_id = self.aggregator._extract_video_id(
            entry, "https://youtu.be/dQw4w9WgXcQ"
        )
        self.assertEqual(video_id, "dQw4w9WgXcQ")

    def test_extract_video_id_from_entry(self):
        """Test video ID extraction from RSS entry."""
        entry = {"yt_videoid": "test123video"}
        video_id = self.aggregator._extract_video_id(entry, "")
        self.assertEqual(video_id, "test123video")

    def test_generate_thumbnail_url(self):
        """Test thumbnail URL generation."""
        entry = {}
        thumbnail = self.aggregator._extract_thumbnail(entry, "dQw4w9WgXcQ")
        self.assertEqual(
            thumbnail, "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg"
        )

    def test_fetch_article_html_generates_embed(self):
        """Test that fetch_article_html generates description HTML."""
        from aggregators.base.models import RawArticle

        entry = {
            "_youtube_video_id": "testVideo123",
            "summary": "Test video description",
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
        self.assertIn("<p>", html)


class PodcastAggregatorTests(TestCase):
    """Test Podcast aggregator functionality."""

    def setUp(self):
        """Set up test fixtures."""
        User = get_user_model()
        self.user = User.objects.create_user(
            username="testuser", email="test@example.com", password="testpass"
        )
        self.feed = Feed.objects.create(
            name="Test Podcast",
            identifier="https://example.com/podcast.xml",
            feed_type="podcast",
            aggregator="podcast",
            user=self.user,
        )
        self.aggregator = PodcastAggregator()

    def test_aggregator_metadata(self):
        """Test aggregator has correct metadata."""
        self.assertEqual(self.aggregator.id, "podcast")
        self.assertEqual(self.aggregator.type, "custom")
        self.assertEqual(self.aggregator.name, "Podcast")
        self.assertIn("podcast", self.aggregator.description.lower())

    def test_extract_enclosure(self):
        """Test audio enclosure extraction."""
        entry = {
            "enclosures": [
                {"url": "https://example.com/episode.mp3", "type": "audio/mpeg"}
            ]
        }
        url, media_type = self.aggregator._extract_enclosure(entry)
        self.assertEqual(url, "https://example.com/episode.mp3")
        self.assertEqual(media_type, "audio/mpeg")

    def test_extract_enclosure_from_links(self):
        """Test audio extraction from links with enclosure rel."""
        entry = {
            "enclosures": [],
            "links": [
                {
                    "rel": "enclosure",
                    "href": "https://example.com/episode.m4a",
                    "type": "audio/x-m4a",
                }
            ],
        }
        url, media_type = self.aggregator._extract_enclosure(entry)
        self.assertEqual(url, "https://example.com/episode.m4a")
        self.assertEqual(media_type, "audio/x-m4a")

    def test_extract_duration(self):
        """Test duration extraction from iTunes namespace."""
        entry = {"itunes_duration": "01:30:00"}
        duration = self.aggregator._extract_duration(entry)
        self.assertEqual(duration, 5400)

    def test_extract_image(self):
        """Test episode image extraction."""
        entry = {"itunes_image": {"href": "https://example.com/cover.jpg"}}
        image = self.aggregator._extract_image(entry)
        self.assertEqual(image, "https://example.com/cover.jpg")

    def test_fetch_article_html_generates_player(self):
        """Test that fetch_article_html generates audio player HTML."""
        from aggregators.base.models import RawArticle

        entry = {
            "_podcast_audio_url": "https://example.com/episode.mp3",
            "_podcast_audio_type": "audio/mpeg",
            "_podcast_duration": 3600,
            "_podcast_image": "https://example.com/cover.jpg",
            "itunes_summary": "Episode description here.",
        }
        article = RawArticle(
            url="https://example.com/episode",
            title="Test Episode",
            date=datetime.now(),
            content="",
            entry=entry,
        )

        html = self.aggregator.fetch_article_html(article)

        # Check for audio player
        self.assertIn("podcast-player", html)
        self.assertIn("<audio", html)
        self.assertIn("episode.mp3", html)
        # Check for artwork
        self.assertIn("podcast-artwork", html)
        self.assertIn("cover.jpg", html)
        # Check for download link
        self.assertIn("podcast-download", html)


class FeedTypeTests(TestCase):
    """Test feed type model fields and filtering."""

    def setUp(self):
        """Set up test fixtures."""
        User = get_user_model()
        self.user = User.objects.create_user(
            username="testuser", email="test@example.com", password="testpass"
        )

    def test_feed_type_default(self):
        """Test that feed_type defaults to 'article'."""
        feed = Feed.objects.create(
            name="Test Feed",
            identifier="https://example.com/feed.xml",
            user=self.user,
        )
        self.assertEqual(feed.feed_type, "article")

    def test_feed_type_youtube(self):
        """Test YouTube feed type."""
        feed = Feed.objects.create(
            name="YouTube Channel",
            identifier="https://youtube.com/feeds/videos.xml?channel_id=test",
            feed_type="youtube",
            user=self.user,
        )
        self.assertEqual(feed.feed_type, "youtube")

    def test_feed_type_podcast(self):
        """Test Podcast feed type."""
        feed = Feed.objects.create(
            name="Test Podcast",
            identifier="https://example.com/podcast.xml",
            feed_type="podcast",
            user=self.user,
        )
        self.assertEqual(feed.feed_type, "podcast")

    def test_filter_by_feed_type(self):
        """Test filtering feeds by type."""
        # Create feeds of different types
        Feed.objects.create(
            name="Article Feed",
            identifier="https://example.com/feed.xml",
            feed_type="article",
            user=self.user,
        )
        Feed.objects.create(
            name="YouTube Feed",
            identifier="https://youtube.com/feeds/test",
            feed_type="youtube",
            user=self.user,
        )
        Feed.objects.create(
            name="Podcast Feed",
            identifier="https://example.com/podcast.xml",
            feed_type="podcast",
            user=self.user,
        )

        # Filter by type
        articles = Feed.objects.filter(feed_type="article")
        youtube = Feed.objects.filter(feed_type="youtube")
        podcasts = Feed.objects.filter(feed_type="podcast")

        self.assertEqual(articles.count(), 1)
        self.assertEqual(youtube.count(), 1)
        self.assertEqual(podcasts.count(), 1)


class ArticleMediaFieldsTests(TestCase):
    """Test Article media metadata fields."""

    def setUp(self):
        """Set up test fixtures."""
        User = get_user_model()
        self.user = User.objects.create_user(
            username="testuser", email="test@example.com", password="testpass"
        )
        self.youtube_feed = Feed.objects.create(
            name="YouTube Feed",
            identifier="https://youtube.com/feeds/test",
            feed_type="youtube",
            user=self.user,
        )
        self.podcast_feed = Feed.objects.create(
            name="Podcast Feed",
            identifier="https://example.com/podcast.xml",
            feed_type="podcast",
            user=self.user,
        )

    def test_article_is_video(self):
        """Test is_video property."""
        article = Article.objects.create(
            feed=self.youtube_feed,
            name="Test Video",
            url="https://youtube.com/watch?v=test",
            content="<p>Test</p>",
        )
        self.assertTrue(article.is_video)
        self.assertFalse(article.is_podcast)

    def test_article_is_podcast(self):
        """Test is_podcast property."""
        article = Article.objects.create(
            feed=self.podcast_feed,
            name="Test Episode",
            url="https://example.com/episode",
            content="<p>Test</p>",
        )
        self.assertTrue(article.is_podcast)
        self.assertFalse(article.is_video)

    def test_duration_formatted(self):
        """Test duration_formatted property."""
        article = Article.objects.create(
            feed=self.podcast_feed,
            name="Test Episode",
            url="https://example.com/episode1",
            content="<p>Test</p>",
            duration=3661,  # 1 hour, 1 minute, 1 second
        )
        self.assertEqual(article.duration_formatted, "1:01:01")

        # Test without hours
        article2 = Article.objects.create(
            feed=self.podcast_feed,
            name="Short Episode",
            url="https://example.com/episode2",
            content="<p>Test</p>",
            duration=125,  # 2 minutes, 5 seconds
        )
        self.assertEqual(article2.duration_formatted, "2:05")

    def test_youtube_video_id(self):
        """Test YouTube video ID extraction."""
        article = Article.objects.create(
            feed=self.youtube_feed,
            name="Test Video",
            url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            content="<p>Test</p>",
        )
        self.assertEqual(article.youtube_video_id, "dQw4w9WgXcQ")

    def test_youtube_embed_url(self):
        """Test YouTube embed URL generation."""
        article = Article.objects.create(
            feed=self.youtube_feed,
            name="Test Video",
            url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            content="<p>Test</p>",
        )
        # Should use proxy URL format
        self.assertEqual(
            article.youtube_embed_url,
            "http://localhost:8000/api/youtube-proxy?v=dQw4w9WgXcQ",
        )

    def test_has_media(self):
        """Test has_media property."""
        # Article without media
        article1 = Article.objects.create(
            feed=self.podcast_feed,
            name="No Media",
            url="https://example.com/no-media",
            content="<p>Test</p>",
        )
        self.assertFalse(article1.has_media)

        # Article with media
        article2 = Article.objects.create(
            feed=self.podcast_feed,
            name="With Media",
            url="https://example.com/with-media",
            content="<p>Test</p>",
            media_url="https://example.com/audio.mp3",
        )
        self.assertTrue(article2.has_media)


if __name__ == "__main__":
    unittest.main()
