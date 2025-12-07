"""
Tests for the Yana core app.
"""

import logging
from io import StringIO
from unittest.mock import MagicMock, patch

from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import Client, TestCase
from django.utils import timezone

from .models import Article, Feed

logger = logging.getLogger(__name__)


class FeedModelTest(TestCase):
    """Tests for the Feed model."""

    def setUp(self) -> None:
        """Set up test data."""
        self.feed = Feed.objects.create(
            name="Test Feed",
            identifier="https://example.com/feed.xml",
            icon="https://example.com/icon.png",
            aggregator="mein_mmo",
        )

    def test_feed_creation(self) -> None:
        """Test that a feed can be created with valid data."""
        self.assertEqual(self.feed.name, "Test Feed")
        self.assertEqual(self.feed.identifier, "https://example.com/feed.xml")
        self.assertEqual(self.feed.icon, "https://example.com/icon.png")
        self.assertEqual(self.feed.aggregator, "mein_mmo")
        self.assertIsNotNone(self.feed.created_at)
        self.assertIsNotNone(self.feed.updated_at)

    def test_feed_str(self) -> None:
        """Test the string representation of a feed."""
        self.assertEqual(str(self.feed), "Test Feed")

    def test_feed_repr(self) -> None:
        """Test the repr of a feed."""
        self.assertEqual(
            repr(self.feed), "<Feed: Test Feed (https://example.com/feed.xml)>"
        )

    def test_feed_example_blank(self) -> None:
        """Test that example field can be blank."""
        feed = Feed.objects.create(
            name="Feed Without Example",
            identifier="https://example.com/feed2.xml",
            aggregator="mein_mmo",
        )
        self.assertEqual(feed.example, "")

    def test_feed_url_duplicate_allowed(self) -> None:
        """Test that feed URLs can be duplicated with different names."""
        # Create a second feed with the same URL
        duplicate_feed = Feed.objects.create(
            name="Duplicate Feed",
            identifier="https://example.com/feed.xml",  # Same URL as self.feed
            aggregator="mein_mmo",
        )

        # Verify both feeds exist
        self.assertEqual(
            Feed.objects.filter(identifier="https://example.com/feed.xml").count(), 2
        )

        # Verify they have different names
        feeds = Feed.objects.filter(identifier="https://example.com/feed.xml").order_by(
            "name"
        )
        self.assertEqual(feeds[0].name, "Duplicate Feed")
        self.assertEqual(feeds[1].name, "Test Feed")

        # Clean up
        duplicate_feed.delete()

    def test_feed_ordering(self) -> None:
        """Test that feeds are ordered by name."""
        Feed.objects.create(
            name="Alpha Feed",
            identifier="https://example.com/alpha.xml",
            aggregator="mein_mmo",
        )
        Feed.objects.create(
            name="Zeta Feed",
            identifier="https://example.com/zeta.xml",
            aggregator="mein_mmo",
        )
        feeds = Feed.objects.all()
        self.assertEqual(feeds[0].name, "Alpha Feed")
        self.assertEqual(feeds[1].name, "Test Feed")
        self.assertEqual(feeds[2].name, "Zeta Feed")


class ArticleModelTest(TestCase):
    """Tests for the Article model."""

    def setUp(self) -> None:
        """Set up test data."""
        self.feed = Feed.objects.create(
            name="Test Feed",
            identifier="https://example.com/feed.xml",
            aggregator="mein_mmo",
        )
        self.article = Article.objects.create(
            feed=self.feed,
            name="Test Article",
            url="https://example.com/article1",
            content="<p>Test content</p>",
        )

    def test_article_creation(self) -> None:
        """Test that an article can be created with valid data."""
        self.assertEqual(self.article.name, "Test Article")
        self.assertEqual(self.article.url, "https://example.com/article1")
        self.assertEqual(self.article.content, "<p>Test content</p>")
        self.assertEqual(self.article.feed, self.feed)
        self.assertIsNotNone(self.article.date)
        self.assertIsNotNone(self.article.created_at)
        self.assertIsNotNone(self.article.updated_at)

    def test_article_str(self) -> None:
        """Test the string representation of an article."""
        self.assertEqual(str(self.article), "Test Article")

    def test_article_repr(self) -> None:
        """Test the repr of an article."""
        self.assertEqual(repr(self.article), "<Article: Test Article from Test Feed>")

    def test_article_url_unique(self) -> None:
        """Test that article URLs must be unique."""
        from django.db import IntegrityError

        with self.assertRaises(IntegrityError):
            Article.objects.create(
                feed=self.feed,
                name="Duplicate Article",
                url="https://example.com/article1",  # Same URL
                content="<p>Content</p>",
            )

    def test_article_ordering(self) -> None:
        """Test that articles are ordered by date (newest first)."""
        Article.objects.create(
            feed=self.feed,
            name="Old Article",
            url="https://example.com/old",
            content="<p>Old</p>",
            date=timezone.now() - timezone.timedelta(days=1),
        )
        Article.objects.create(
            feed=self.feed,
            name="New Article",
            url="https://example.com/new",
            content="<p>New</p>",
            date=timezone.now() + timezone.timedelta(days=1),
        )
        articles = Article.objects.all()
        self.assertEqual(articles[0].name, "New Article")

    def test_article_feed_relationship(self) -> None:
        """Test the reverse relationship from Feed to Articles."""
        Article.objects.create(
            feed=self.feed,
            name="Second Article",
            url="https://example.com/article2",
            content="<p>Content 2</p>",
        )
        self.assertEqual(self.feed.articles.count(), 2)

    def test_article_cascade_delete(self) -> None:
        """Test that articles are deleted when their feed is deleted."""
        article_id = self.article.id
        self.feed.delete()
        self.assertFalse(Article.objects.filter(id=article_id).exists())


class UniversalFeedTest(TestCase):
    """Tests for the UniversalFeed RSS syndication."""

    def setUp(self) -> None:
        """Set up test data."""

        self.client = Client()
        # Create a test user for authentication
        self.user = User.objects.create_user(
            username="testuser", password="testpass123"
        )
        # Log in the client
        self.client.login(username="testuser", password="testpass123")

        self.feed = Feed.objects.create(
            name="Test Feed",
            identifier="https://example.com/feed.xml",
            aggregator="mein_mmo",
            user=self.user,  # Assign feed to test user
        )
        self.article1 = Article.objects.create(
            feed=self.feed,
            name="Article 1",
            url="https://example.com/article1",
            content="<p>Content 1</p>",
            date=timezone.now(),
        )
        self.article2 = Article.objects.create(
            feed=self.feed,
            name="Article 2",
            url="https://example.com/article2",
            content="<p>Content 2</p>",
            date=timezone.now() - timezone.timedelta(hours=1),
        )

    def test_feed_returns_rss(self) -> None:
        """Test that the feed endpoint returns RSS content."""
        response = self.client.get(f"/feeds/{self.feed.id}/rss.xml")
        self.assertEqual(response.status_code, 200)
        self.assertIn("application/rss+xml", response["Content-Type"])

    def test_feed_contains_articles(self) -> None:
        """Test that the feed contains the articles."""
        response = self.client.get(f"/feeds/{self.feed.id}/rss.xml")
        content = response.content.decode("utf-8")
        self.assertIn("Article 1", content)
        self.assertIn("Article 2", content)
        self.assertIn("https://example.com/article1", content)
        self.assertIn("https://example.com/article2", content)

    def test_feed_contains_content(self) -> None:
        """Test that the feed contains article content."""
        response = self.client.get(f"/feeds/{self.feed.id}/rss.xml")
        content = response.content.decode("utf-8")
        self.assertIn("Content 1", content)
        self.assertIn("Content 2", content)

    def test_feed_404_for_nonexistent(self) -> None:
        """Test that a 404 is returned for non-existent feeds."""
        response = self.client.get("/feeds/9999/rss.xml")
        self.assertEqual(response.status_code, 404)

    def test_feed_requires_authentication(self) -> None:
        """Test that unauthenticated access to feeds returns 401."""
        # Create unauthenticated client
        client = Client()
        response = client.get(f"/feeds/{self.feed.id}/rss.xml")
        self.assertEqual(response.status_code, 401)
        self.assertIn("WWW-Authenticate", response)

    def test_feed_user_cannot_access_other_user_feed(self) -> None:
        """Test that a user cannot access another user's feed."""

        # Create another user and feed
        other_user = User.objects.create_user(
            username="otheruser", password="otherpass"
        )
        other_feed = Feed.objects.create(
            name="Other Feed",
            identifier="https://example.com/other.xml",
            aggregator="mein_mmo",
            user=other_user,
        )

        # Try to access other user's feed
        response = self.client.get(f"/feeds/{other_feed.id}/rss.xml")
        self.assertEqual(response.status_code, 403)

    def test_feed_title(self) -> None:
        """Test that the feed has the correct title."""
        response = self.client.get(f"/feeds/{self.feed.id}/rss.xml")
        content = response.content.decode("utf-8")
        self.assertIn("<title>Test Feed</title>", content)


class AggregateCommandTest(TestCase):
    """Tests for the aggregate management command."""

    def setUp(self) -> None:
        """Set up test data."""
        self.feed = Feed.objects.create(
            name="Test Feed",
            identifier="https://example.com/feed.xml",
            aggregator="mein_mmo",
        )

    @patch("core.services.aggregation_service.AggregationService.aggregate_feed")
    def test_aggregate_all_feeds(self, mock_aggregate: MagicMock) -> None:
        """Test aggregating all feeds."""
        mock_aggregate.return_value = 5

        out = StringIO()
        call_command("aggregate", stdout=out)

        mock_aggregate.assert_called_once()
        self.assertIn("5 new articles", out.getvalue())

    @patch("core.services.aggregation_service.AggregationService.aggregate_feed")
    def test_aggregate_with_force(self, mock_aggregate: MagicMock) -> None:
        """Test aggregating with force refresh."""
        mock_aggregate.return_value = 10

        out = StringIO()
        call_command("aggregate", "--force", stdout=out)

        mock_aggregate.assert_called_once_with(self.feed, True, {})

    @patch("core.services.aggregation_service.AggregationService.aggregate_feed")
    def test_aggregate_specific_feeds(self, mock_aggregate: MagicMock) -> None:
        """Test aggregating specific feeds by name."""
        # Create another feed
        Feed.objects.create(
            name="Other Feed",
            identifier="https://example.com/other.xml",
            aggregator="mein_mmo",
        )

        mock_aggregate.return_value = 3

        out = StringIO()
        call_command("aggregate", "--feeds", "Test Feed", stdout=out)

        # Should only aggregate Test Feed, not Other Feed
        self.assertEqual(mock_aggregate.call_count, 1)
        mock_aggregate.assert_called_with(self.feed, False, {})

    def test_aggregate_no_feeds(self) -> None:
        """Test aggregate command when no feeds exist."""
        Feed.objects.all().delete()

        out = StringIO()
        call_command("aggregate", stdout=out)

        self.assertIn("No feeds found", out.getvalue())

    def test_aggregate_feed_not_found(self) -> None:
        """Test aggregate command with non-existent feed name."""
        out = StringIO()
        call_command("aggregate", "--feeds", "NonExistent Feed", stdout=out)

        self.assertIn("No feeds found matching", out.getvalue())

    @patch("core.services.aggregation_service.AggregationService.aggregate_feed")
    def test_aggregate_handles_errors(self, mock_aggregate: MagicMock) -> None:
        """Test that aggregate command handles errors gracefully."""
        mock_aggregate.side_effect = Exception("Module not found")

        out = StringIO()
        call_command("aggregate", stdout=out)

        self.assertIn("Error processing feed", out.getvalue())


class BaseAggregatorTest(TestCase):
    """Tests for the base aggregator utilities."""

    def test_sanitize_html(self) -> None:
        """Test HTML sanitization."""
        from aggregators.base import sanitize_html

        # Test script removal
        html = '<p>Hello</p><script>alert("xss")</script>'
        sanitized = sanitize_html(html)
        self.assertNotIn("<script>", sanitized)
        self.assertIn("<p>Hello</p>", sanitized)

        # Test style removal
        html = "<p>Hello</p><style>.bad { color: red; }</style>"
        sanitized = sanitize_html(html)
        self.assertNotIn("<style>", sanitized)

        # Test iframe removal
        html = '<p>Hello</p><iframe src="evil.com"></iframe>'
        sanitized = sanitize_html(html)
        self.assertNotIn("<iframe>", sanitized)

    def test_clear_cache(self) -> None:
        """Test cache clearing."""
        import time

        from aggregators.base import _url_cache, clear_cache

        # Add something to cache (cache now stores (content, timestamp) tuples)
        _url_cache["test_key"] = ("test_value", time.time())
        self.assertEqual(len(_url_cache), 1)

        # Clear cache
        clear_cache()
        self.assertEqual(len(_url_cache), 0)

    def test_get_cache_stats(self) -> None:
        """Test cache statistics."""
        import time

        from aggregators.base import _url_cache, clear_cache, get_cache_stats

        clear_cache()

        # Add items to cache (cache now stores (content, timestamp) tuples)
        current_time = time.time()
        _url_cache["key1"] = ("value1", current_time)
        _url_cache["key2"] = ("longer value 2", current_time)

        stats = get_cache_stats()
        self.assertEqual(stats["entries"], 2)
        self.assertEqual(stats["valid_entries"], 2)
        self.assertEqual(
            stats["total_size_bytes"], len("value1") + len("longer value 2")
        )

        clear_cache()

    @patch("feedparser.parse")
    def test_fetch_feed(self, mock_parse: MagicMock) -> None:
        """Test fetching RSS feeds."""
        from aggregators.base import fetch_feed

        mock_parse.return_value = MagicMock(
            bozo=False, entries=[{"title": "Test Entry"}]
        )

        result = fetch_feed("https://example.com/feed.xml")

        mock_parse.assert_called_once_with("https://example.com/feed.xml")
        self.assertEqual(len(result.entries), 1)

    @patch("feedparser.parse")
    def test_fetch_feed_empty(self, mock_parse: MagicMock) -> None:
        """Test fetching RSS feed with no entries."""
        from aggregators.base import fetch_feed

        mock_parse.return_value = MagicMock(bozo=False, entries=[])

        result = fetch_feed("https://example.com/feed.xml")
        self.assertEqual(len(result.entries), 0)

    def test_extract_youtube_video_id(self) -> None:
        """Test extracting YouTube video IDs from various URL formats."""
        from aggregators.base import extract_youtube_video_id

        # Test standard watch URL
        video_id = extract_youtube_video_id(
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        )
        self.assertEqual(video_id, "dQw4w9WgXcQ")

        # Test short URL
        video_id = extract_youtube_video_id("https://youtu.be/dQw4w9WgXcQ")
        self.assertEqual(video_id, "dQw4w9WgXcQ")

        # Test embed URL
        video_id = extract_youtube_video_id("https://www.youtube.com/embed/dQw4w9WgXcQ")
        self.assertEqual(video_id, "dQw4w9WgXcQ")

        # Test shorts URL
        video_id = extract_youtube_video_id("https://youtube.com/shorts/dQw4w9WgXcQ")
        self.assertEqual(video_id, "dQw4w9WgXcQ")

        # Test non-YouTube URL
        video_id = extract_youtube_video_id("https://example.com/video")
        self.assertIsNone(video_id)

    @patch("aggregators.base.fetch._fetch_single_image")
    @patch("aggregators.base.fetch.requests.get")
    def test_extract_image_from_x_com_success(
        self, mock_get: MagicMock, mock_fetch_image: MagicMock
    ) -> None:
        """Test successful image extraction from X.com using fxtwitter API."""
        from aggregators.base import extract_image_from_url

        # Mock fxtwitter API response
        mock_api_response = MagicMock()
        mock_api_response.status_code = 200
        mock_api_response.json.return_value = {
            "tweet": {
                "media": {
                    "photos": [
                        {"url": "https://pbs.twimg.com/media/test123.jpg"},
                        {"url": "https://pbs.twimg.com/media/test456.jpg"},
                    ]
                }
            }
        }
        mock_api_response.raise_for_status = MagicMock()
        mock_get.return_value = mock_api_response

        # Mock image fetch
        fake_image_data = b"fake_image_data"
        mock_fetch_image.return_value = (
            "https://pbs.twimg.com/media/test123.jpg",
            fake_image_data,
            "image/jpeg",
        )

        # Test extraction
        result = extract_image_from_url("https://x.com/user/status/1234567890")

        # Verify API was called (should only be called once for fxtwitter API)
        mock_get.assert_called_with(
            "https://api.fxtwitter.com/status/1234567890", timeout=10
        )

        # Verify image was fetched
        mock_fetch_image.assert_called_with("https://pbs.twimg.com/media/test123.jpg")

        # Verify result
        self.assertIsNotNone(result)
        self.assertEqual(result[0], fake_image_data)
        self.assertEqual(result[1], "image/jpeg")

    @patch("aggregators.base.fetch._fetch_single_image")
    @patch("aggregators.base.fetch.requests.get")
    def test_extract_image_from_x_com_with_all_media(
        self, mock_get: MagicMock, mock_fetch_image: MagicMock
    ) -> None:
        """Test X.com image extraction using fallback to tweet.media.all."""
        from aggregators.base import extract_image_from_url

        # Mock fxtwitter API response with media in 'all' field
        mock_api_response = MagicMock()
        mock_api_response.status_code = 200
        mock_api_response.json.return_value = {
            "tweet": {
                "media": {
                    "all": [
                        {"type": "video", "url": "https://video.twimg.com/vid.mp4"},
                        {"type": "photo", "url": "https://pbs.twimg.com/media/pic.jpg"},
                    ]
                }
            }
        }
        mock_api_response.raise_for_status = MagicMock()
        mock_get.return_value = mock_api_response

        # Mock image fetch
        fake_image_data = b"fake_image_data"
        mock_fetch_image.return_value = (
            "https://pbs.twimg.com/media/pic.jpg",
            fake_image_data,
            "image/jpeg",
        )

        # Test extraction
        result = extract_image_from_url("https://twitter.com/user/status/9876543210")

        # Verify result
        self.assertIsNotNone(result)
        self.assertEqual(result[0], fake_image_data)
        self.assertEqual(result[1], "image/jpeg")

    @patch("aggregators.base.fetch.requests.get")
    def test_extract_image_from_x_com_no_images(self, mock_get: MagicMock) -> None:
        """Test X.com URL with no images in API response."""
        from aggregators.base import extract_image_from_url

        # Mock both the fxtwitter API call and the fallback page fetch
        def mock_get_side_effect(url, **kwargs):
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.raise_for_status = MagicMock()

            if "api.fxtwitter.com" in url:
                # fxtwitter API response with no images
                mock_response.json.return_value = {"tweet": {"media": {}}}
            else:
                # Fallback page fetch - return minimal HTML
                mock_response.text = "<html><head></head><body></body></html>"

            return mock_response

        mock_get.side_effect = mock_get_side_effect

        # Test extraction - should try API, then fall through to page fetch
        _ = extract_image_from_url("https://x.com/user/status/1111111111")

        # Verify both calls were made (API + page fetch)
        self.assertTrue(mock_get.call_count >= 2)

    @patch("aggregators.base.fetch.requests.get")
    def test_extract_image_from_x_com_api_error(self, mock_get: MagicMock) -> None:
        """Test X.com image extraction when API fails."""
        from aggregators.base import extract_image_from_url

        # Mock fxtwitter API to raise error, then return HTML for page fetch
        call_count = 0

        def mock_get_side_effect(url, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                # First call (fxtwitter API) raises error
                raise Exception("API Error")
            else:
                # Subsequent call (page fetch) returns HTML
                mock_response = MagicMock()
                mock_response.status_code = 200
                mock_response.text = "<html><head></head><body></body></html>"
                mock_response.raise_for_status = MagicMock()
                return mock_response

        mock_get.side_effect = mock_get_side_effect

        # Test extraction - should handle error gracefully and fall through
        # to standard extraction methods
        _ = extract_image_from_url("https://x.com/user/status/2222222222")

        # Should not raise exception
        self.assertTrue(mock_get.called)

    @patch("aggregators.base.fetch.requests.get")
    def test_extract_image_from_x_com_invalid_url(self, mock_get: MagicMock) -> None:
        """Test X.com URL without valid tweet ID."""
        from aggregators.base import extract_image_from_url

        # Mock page fetch to return minimal HTML
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = "<html><head></head><body></body></html>"
        mock_response.raise_for_status = MagicMock()
        mock_get.return_value = mock_response

        # X.com URL without status/ID pattern - should skip API and go to page fetch
        _ = extract_image_from_url("https://x.com/user")

        # Should call page fetch (no API call since no tweet ID)
        self.assertTrue(mock_get.called)

    @patch("aggregators.base.fetch._fetch_single_image")
    def test_extract_image_from_youtube_url(self, mock_fetch_image: MagicMock) -> None:
        """Test extracting thumbnail from YouTube URL."""
        from aggregators.base import extract_image_from_url

        # Mock image fetch for thumbnail (must be > 1000 bytes to pass validation)
        fake_image_data = b"fake_thumbnail_data" * 100  # Make it large enough
        mock_fetch_image.return_value = (
            "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
            fake_image_data,
            "image/jpeg",
        )

        # Test extraction
        result = extract_image_from_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ")

        # Verify thumbnail URL was tried
        self.assertTrue(mock_fetch_image.called)
        call_args = mock_fetch_image.call_args[0][0]
        # Check for YouTube thumbnail domain (img.youtube.com or i.ytimg.com)
        self.assertTrue(
            "img.youtube.com" in call_args or "ytimg.com" in call_args,
            f"Expected YouTube thumbnail URL, got: {call_args}",
        )
        self.assertIn("dQw4w9WgXcQ", call_args)

        # Verify result
        self.assertIsNotNone(result)
        self.assertEqual(result[0], fake_image_data)
        self.assertEqual(result[1], "image/jpeg")


class FetchFaviconTest(TestCase):
    """Tests for the fetch_favicon function."""

    @patch("requests.get")
    @patch("requests.head")
    def test_fetch_favicon_from_html(
        self, mock_head: MagicMock, mock_get: MagicMock
    ) -> None:
        """Test fetching favicon from HTML link tag."""
        from core.services.icon_service import IconService

        icon_service = IconService()
        mock_get.return_value = MagicMock(
            status_code=200,
            text='<html><head><link rel="icon" href="/favicon.png"></head></html>',
            raise_for_status=MagicMock(),
        )

        result = icon_service.fetch_favicon("https://example.com/feed.xml")
        self.assertEqual(result, "https://example.com/favicon.png")

    @patch("requests.get")
    @patch("requests.head")
    def test_fetch_favicon_fallback_to_ico(
        self, mock_head: MagicMock, mock_get: MagicMock
    ) -> None:
        """Test fallback to /favicon.ico."""
        from core.services.icon_service import IconService

        icon_service = IconService()
        mock_get.return_value = MagicMock(
            status_code=200,
            text="<html><head></head></html>",
            raise_for_status=MagicMock(),
        )
        mock_head.return_value = MagicMock(status_code=200)

        result = icon_service.fetch_favicon("https://example.com/feed.xml")
        self.assertEqual(result, "https://example.com/favicon.ico")

    @patch("requests.get")
    @patch("requests.head")
    def test_fetch_favicon_not_found(
        self, mock_head: MagicMock, mock_get: MagicMock
    ) -> None:
        """Test when no favicon is found."""
        from core.services.icon_service import IconService

        icon_service = IconService()
        mock_get.return_value = MagicMock(
            status_code=200,
            text="<html><head></head></html>",
            raise_for_status=MagicMock(),
        )
        mock_head.return_value = MagicMock(status_code=404)

        result = icon_service.fetch_favicon("https://example.com/feed.xml")
        self.assertIsNone(result)


class CleanDjangoQHistoryTest(TestCase):
    """Tests for the clean_django_q_history task."""

    def test_clean_old_success_tasks(self) -> None:
        """Test that old successful tasks are deleted."""
        from django_q.models import Success

        from core.tasks import clean_django_q_history

        # Create old and recent successful tasks
        old_date = timezone.now() - timezone.timedelta(days=10)
        recent_date = timezone.now() - timezone.timedelta(days=3)

        Success.objects.create(
            id="test_old_success_task",
            name="old_task",
            func="test.func",
            started=old_date,
            stopped=old_date,
            success=True,
        )
        Success.objects.create(
            id="test_recent_success_task",
            name="recent_task",
            func="test.func",
            started=recent_date,
            stopped=recent_date,
            success=True,
        )

        # Run cleanup (default: delete tasks older than 7 days)
        result = clean_django_q_history()

        # Verify old task was deleted but recent one remains
        self.assertEqual(Success.objects.count(), 1)
        self.assertEqual(result["success_tasks_deleted"], 1)
        self.assertEqual(Success.objects.first().name, "recent_task")

    def test_clean_old_failed_tasks(self) -> None:
        """Test that old failed tasks are deleted."""
        from django_q.models import Failure

        from core.tasks import clean_django_q_history

        # Create old and recent failed tasks
        old_date = timezone.now() - timezone.timedelta(days=10)
        recent_date = timezone.now() - timezone.timedelta(days=3)

        Failure.objects.create(
            id="test_old_failure_task",
            name="old_task",
            func="test.func",
            started=old_date,
            stopped=old_date,
            success=False,
        )
        Failure.objects.create(
            id="test_recent_failure_task",
            name="recent_task",
            func="test.func",
            started=recent_date,
            stopped=recent_date,
            success=False,
        )

        # Run cleanup (default: delete tasks older than 7 days)
        result = clean_django_q_history()

        # Verify old task was deleted but recent one remains
        self.assertEqual(Failure.objects.count(), 1)
        self.assertEqual(result["failed_tasks_deleted"], 1)
        self.assertEqual(Failure.objects.first().name, "recent_task")

    def test_clean_with_custom_days(self) -> None:
        """Test cleanup with custom retention period."""
        from django_q.models import Success

        from core.tasks import clean_django_q_history

        # Create tasks at different ages
        very_old_date = timezone.now() - timezone.timedelta(days=5)
        old_date = timezone.now() - timezone.timedelta(days=2)
        recent_date = timezone.now() - timezone.timedelta(hours=12)

        Success.objects.create(
            id="test_very_old_custom_task",
            name="very_old_task",
            func="test.func",
            started=very_old_date,
            stopped=very_old_date,
            success=True,
        )
        Success.objects.create(
            id="test_old_custom_task",
            name="old_task",
            func="test.func",
            started=old_date,
            stopped=old_date,
            success=True,
        )
        Success.objects.create(
            id="test_recent_custom_task",
            name="recent_task",
            func="test.func",
            started=recent_date,
            stopped=recent_date,
            success=True,
        )

        # Run cleanup with 3 days retention
        result = clean_django_q_history(days=3)

        # Verify only tasks older than 3 days were deleted
        self.assertEqual(Success.objects.count(), 2)
        self.assertEqual(result["success_tasks_deleted"], 1)
        self.assertFalse(Success.objects.filter(name="very_old_task").exists())

    def test_clean_no_old_tasks(self) -> None:
        """Test cleanup when there are no old tasks."""
        from django_q.models import Failure, Success

        from core.tasks import clean_django_q_history

        # Create only recent tasks
        recent_date = timezone.now() - timezone.timedelta(days=3)

        Success.objects.create(
            id="test_recent_no_old_success",
            name="recent_success",
            func="test.func",
            started=recent_date,
            stopped=recent_date,
            success=True,
        )
        Failure.objects.create(
            id="test_recent_no_old_failure",
            name="recent_failure",
            func="test.func",
            started=recent_date,
            stopped=recent_date,
            success=False,
        )

        # Run cleanup
        result = clean_django_q_history()

        # Verify nothing was deleted
        self.assertEqual(Success.objects.count(), 1)
        self.assertEqual(Failure.objects.count(), 1)
        self.assertEqual(result["success_tasks_deleted"], 0)
        self.assertEqual(result["failed_tasks_deleted"], 0)
        self.assertEqual(len(result["errors"]), 0)


class AggregatorOptionsTest(TestCase):
    """Tests for aggregator OPTIONS schema validation."""

    def test_option_definition_valid_boolean(self) -> None:
        """Test that a valid boolean option definition is accepted."""
        from aggregators.base import OptionDefinition

        option = OptionDefinition(
            type="boolean",
            label="Test Boolean",
            help_text="A test boolean option",
            default=False,
        )
        self.assertEqual(option.type, "boolean")
        self.assertEqual(option.default, False)

    def test_option_definition_valid_integer(self) -> None:
        """Test that a valid integer option definition is accepted."""
        from aggregators.base import OptionDefinition

        option = OptionDefinition(
            type="integer",
            label="Test Integer",
            help_text="A test integer option",
            default=10,
            min=0,
            max=100,
        )
        self.assertEqual(option.type, "integer")
        self.assertEqual(option.default, 10)
        self.assertEqual(option.min, 0)
        self.assertEqual(option.max, 100)

    def test_option_definition_invalid_type(self) -> None:
        """Test that invalid option types are rejected."""
        from pydantic import ValidationError

        from aggregators.base import OptionDefinition

        with self.assertRaises(ValidationError):
            OptionDefinition(
                type="invalid_type",
                label="Test Invalid",
                help_text="Invalid type",
            )

    def test_option_definition_default_type_mismatch(self) -> None:
        """Test that default value must match type."""
        from pydantic import ValidationError

        from aggregators.base import OptionDefinition

        with self.assertRaises(ValidationError):
            OptionDefinition(
                type="boolean",
                label="Test Boolean",
                default="not a boolean",  # String instead of boolean
            )

    def test_option_definition_choice_without_choices(self) -> None:
        """Test that choice type requires choices to be defined."""
        from pydantic import ValidationError

        from aggregators.base import OptionDefinition

        with self.assertRaises(ValidationError):
            OptionDefinition(
                type="choice",
                label="Test Choice",
                # Missing choices
            )

    def test_option_definition_choice_invalid_default(self) -> None:
        """Test that choice default must be in choices."""
        from pydantic import ValidationError

        from aggregators.base import OptionDefinition

        with self.assertRaises(ValidationError):
            OptionDefinition(
                type="choice",
                label="Test Choice",
                choices=["a", "b", "c"],
                default="d",  # Not in choices
            )

    def test_validate_aggregator_options_valid(self) -> None:
        """Test validating a valid OPTIONS schema."""
        from aggregators.base import validate_aggregator_options

        options = {
            "option1": {
                "type": "boolean",
                "label": "Option 1",
                "default": True,
            },
            "option2": {
                "type": "integer",
                "label": "Option 2",
                "default": 42,
                "min": 0,
                "max": 100,
            },
        }

        is_valid, error = validate_aggregator_options(options)
        self.assertTrue(is_valid)
        self.assertIsNone(error)

    def test_validate_aggregator_options_invalid(self) -> None:
        """Test validating an invalid OPTIONS schema."""
        from aggregators.base import validate_aggregator_options

        options = {
            "option1": {
                "type": "invalid_type",  # Invalid type
                "label": "Option 1",
            },
        }

        is_valid, error = validate_aggregator_options(options)
        self.assertFalse(is_valid)
        self.assertIsNotNone(error)

    def test_validate_option_values_valid(self) -> None:
        """Test validating runtime option values."""
        from aggregators.base import validate_option_values

        option_definitions = {
            "enabled": {
                "type": "boolean",
                "label": "Enabled",
                "default": False,
            },
            "count": {
                "type": "integer",
                "label": "Count",
                "default": 0,
                "min": 0,
                "max": 100,
            },
        }

        values = {"enabled": True, "count": 50}

        is_valid, error = validate_option_values(option_definitions, values)
        self.assertTrue(is_valid)
        self.assertIsNone(error)

    def test_validate_option_values_type_mismatch(self) -> None:
        """Test that runtime values must match their type."""
        from aggregators.base import validate_option_values

        option_definitions = {
            "enabled": {
                "type": "boolean",
                "label": "Enabled",
                "default": False,
            },
        }

        values = {"enabled": "not a boolean"}  # Wrong type

        is_valid, error = validate_option_values(option_definitions, values)
        self.assertFalse(is_valid)
        self.assertIn("boolean", error)

    def test_validate_option_values_out_of_range(self) -> None:
        """Test that integer values must be within min/max range."""
        from aggregators.base import validate_option_values

        option_definitions = {
            "count": {
                "type": "integer",
                "label": "Count",
                "default": 0,
                "min": 0,
                "max": 100,
            },
        }

        values = {"count": 150}  # Above max

        is_valid, error = validate_option_values(option_definitions, values)
        self.assertFalse(is_valid)
        self.assertIn("max", error)

    def test_get_option_values_with_defaults(self) -> None:
        """Test getting option values with defaults applied."""
        from aggregators.base import get_option_values_with_defaults

        option_definitions = {
            "enabled": {
                "type": "boolean",
                "label": "Enabled",
                "default": False,
            },
            "count": {
                "type": "integer",
                "label": "Count",
                "default": 10,
            },
        }

        # Provide only one value, should use default for the other
        values = {"enabled": True}

        result = get_option_values_with_defaults(option_definitions, values)

        self.assertEqual(result["enabled"], True)
        self.assertEqual(result["count"], 10)  # Default value

    def test_get_option_values_with_empty(self) -> None:
        """Test getting option values when none are provided."""
        from aggregators.base import get_option_values_with_defaults

        option_definitions = {
            "enabled": {
                "type": "boolean",
                "label": "Enabled",
                "default": False,
            },
        }

        result = get_option_values_with_defaults(option_definitions, None)

        self.assertEqual(result["enabled"], False)  # Default value

    def test_feed_aggregator_options_field(self) -> None:
        """Test that Feed model has aggregator_options field."""
        feed = Feed.objects.create(
            name="Test Feed with Options",
            identifier="https://example.com/test.xml",
            aggregator="heise",
            aggregator_options={
                "traverse_multipage": True,
                "max_comments": 50,
            },
        )

        self.assertEqual(feed.aggregator_options["traverse_multipage"], True)
        self.assertEqual(feed.aggregator_options["max_comments"], 50)

    def test_feed_aggregator_options_default_empty(self) -> None:
        """Test that aggregator_options defaults to empty dict."""
        feed = Feed.objects.create(
            name="Test Feed No Options",
            identifier="https://example.com/test2.xml",
            aggregator="heise",
        )

        self.assertEqual(feed.aggregator_options, {})
