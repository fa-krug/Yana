import unittest
from unittest.mock import MagicMock, patch

from core.aggregators.caschys_blog.aggregator import CaschysBlogAggregator


class TestCaschysBlogAggregator(unittest.TestCase):
    def setUp(self):
        self.feed = MagicMock()
        self.feed.identifier = "https://stadt-bremerhaven.de/feed/"
        self.feed.daily_limit = 5
        self.feed.options = {}
        self.aggregator = CaschysBlogAggregator(self.feed)

    @patch("core.aggregators.website.FullWebsiteAggregator.extract_header_element")
    @patch("core.aggregators.website.fetch_html")
    def test_extract_content_caschys_blog(self, mock_fetch, mock_header):
        # Mock header extraction
        mock_header.return_value = None

        # Read fixture
        with open("old/src/server/aggregators/__tests__/fixtures/caschys_blog.html", "r") as f:
            fixture_html = f.read()

        mock_fetch.return_value = fixture_html

        article = {
            "name": "Google Stadia Controller: Voller Steam-Support kurz vor Ende der Frist",
            "identifier": "https://stadt-bremerhaven.de/google-stadia-controller-voller-steam-support-kurz-vor-ende-der-frist/",
            "content": "",
        }

        # Test content extraction
        enriched = self.aggregator.enrich_articles([article])
        content = enriched[0]["content"]

        # Verify content from .entry-inner is present
        self.assertIn("Google Stadia Controller", content)
        self.assertIn("31. Dezember 2025", content)

        # Verify noise is removed
        self.assertNotIn("wpSEO", content)
        self.assertNotIn("Google Analytics", content)

    def test_filter_articles_anzeige(self):
        articles = [
            {"name": "Normal Article", "identifier": "url1", "date": None},
            {"name": "Sponsered (Anzeige)", "identifier": "url2", "date": None},
        ]

        # We need to mock timezone.now() for filter_articles
        with patch("django.utils.timezone.now") as mock_now:
            from datetime import datetime

            from django.utils import timezone

            mock_now.return_value = datetime(2026, 1, 2, tzinfo=timezone.UTC)

            filtered = self.aggregator.filter_articles(articles)

            self.assertEqual(len(filtered), 1)
            self.assertEqual(filtered[0]["name"], "Normal Article")


if __name__ == "__main__":
    unittest.main()
