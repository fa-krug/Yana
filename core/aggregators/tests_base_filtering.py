"""Tests for base aggregator filtering logic."""

from datetime import timedelta
from unittest.mock import MagicMock

from django.test import TestCase
from django.utils import timezone

from core.aggregators.rss import RssAggregator
from core.models import Feed


class TestBaseFiltering(TestCase):
    def setUp(self):
        # Create a mock feed
        self.feed = MagicMock(spec=Feed)
        self.feed.identifier = "https://example.com/rss"
        self.feed.daily_limit = 10
        self.feed.aggregator = "rss"

        # RssAggregator inherits from BaseAggregator
        self.aggregator = RssAggregator(self.feed)
        # Mock logger
        self.aggregator.logger = MagicMock()

    def test_base_filter_articles(self):
        now = timezone.now()

        articles = [
            {
                "name": "New Article",
                "identifier": "http://test.com/new",
                "date": now - timedelta(days=1),
            },
            {
                "name": "Old Article",
                "identifier": "http://test.com/old",
                "date": now - timedelta(days=90),
            },
            {
                "name": "Borderline Article (Keep)",
                "identifier": "http://test.com/borderline",
                "date": now - timedelta(days=59),
            },
            {
                "name": "Borderline Article (Skip)",
                "identifier": "http://test.com/borderline_skip",
                "date": now - timedelta(days=61),
            },
        ]

        filtered = self.aggregator.filter_articles(articles)

        self.assertEqual(len(filtered), 2)

        names = [a["name"] for a in filtered]
        self.assertIn("New Article", names)
        self.assertIn("Borderline Article (Keep)", names)
        self.assertNotIn("Old Article", names)
        self.assertNotIn("Borderline Article (Skip)", names)

        # Check if dates are updated to roughly now
        for article in filtered:
            current_now = timezone.now()
            diff = abs((article["date"] - current_now).total_seconds())
            self.assertLess(diff, 40.0)
