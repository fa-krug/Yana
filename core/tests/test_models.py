from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone

from core.models import Feed, FeedGroup, GReaderAuthToken, RedditSubreddit, YouTubeChannel


class TestFeedModel(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="password")
        self.group = FeedGroup.objects.create(name="Test Group", user=self.user)

    def test_feed_save_syncs_reddit_identifier(self):
        """Test that saving a Feed with reddit aggregator syncs identifier from subreddit."""
        subreddit = RedditSubreddit.objects.create(display_name="python", subscribers=1000)

        # Mock AggregatorRegistry to avoid needing the actual RedditAggregator implementation details here
        # But since we have the real implementation, we might as well use it if it's simple.
        # However, to be unit-testy and robust against changes in RedditAggregator, we can mock.
        # But `core.models` imports it inside the method.
        # Let's try to rely on the real one first, assuming 'reddit' aggregator exists.

        feed = Feed(
            name="Python Reddit",
            aggregator="reddit",
            user=self.user,
            group=self.group,
            reddit_subreddit=subreddit,
        )

        # We need to verify that RedditAggregator has identifier_field="reddit_subreddit"
        # If not, this test might fail or do nothing.
        # Let's assume standard behavior as per the plan.

        feed.save()

        # The RedditAggregator should normalize this to 'r/python' or similar.
        # If the actual implementation isn't fully ready or behaves differently, we might need to adjust.
        # Let's check if 'reddit' is in AGGREGATOR_CHOICES. It is.

        self.assertTrue(feed.identifier)
        self.assertIn("python", feed.identifier)

    def test_feed_save_syncs_youtube_identifier(self):
        """Test that saving a Feed with youtube aggregator syncs identifier from channel."""
        channel = YouTubeChannel.objects.create(channel_id="UC12345", title="Test Channel")

        feed = Feed(
            name="Test Channel",
            aggregator="youtube",
            user=self.user,
            group=self.group,
            youtube_channel=channel,
        )

        feed.save()

        self.assertEqual(feed.identifier, "UC12345")

    @patch("core.aggregators.registry.AggregatorRegistry.get")
    def test_feed_save_handles_error_gracefully(self, mock_get):
        """Test that save continues even if aggregator lookup fails."""
        mock_get.side_effect = Exception("Registry error")

        feed = Feed(name="Error Feed", aggregator="unknown_agg", user=self.user, group=self.group)

        # Should not raise exception
        feed.save()
        self.assertTrue(feed.pk)


class TestGReaderAuthToken(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="tokenuser", password="password")

    def test_generate_for_user(self):
        """Test generating a new token."""
        token = GReaderAuthToken.generate_for_user(self.user, days=7)

        self.assertEqual(token.user, self.user)
        self.assertTrue(token.token)
        self.assertIsNotNone(token.expires_at)

        # Check expiry is roughly 7 days in future
        expected_expiry = timezone.now() + timedelta(days=7)
        # Allow small difference
        diff = abs((token.expires_at - expected_expiry).total_seconds())
        self.assertLess(diff, 10)

    def test_is_valid(self):
        """Test token validity check."""
        # Valid token
        token = GReaderAuthToken.generate_for_user(self.user)
        self.assertTrue(token.is_valid())

        # Expired token
        token.expires_at = timezone.now() - timedelta(hours=1)
        token.save()
        self.assertFalse(token.is_valid())

        # No expiry (forever valid? or invalid? Implementation says: not (expires_at and ...))
        # If expires_at is None, `expires_at < now` is not evaluated.
        # Wait: `if self.expires_at and self.expires_at < timezone.now()`
        # If expires_at is None, it returns True (valid).
        token.expires_at = None
        token.save()
        self.assertTrue(token.is_valid())
