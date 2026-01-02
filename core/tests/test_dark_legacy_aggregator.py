import unittest
from unittest.mock import MagicMock, patch
from core.aggregators.dark_legacy.aggregator import DarkLegacyAggregator

class TestDarkLegacyAggregator(unittest.TestCase):
    def setUp(self):
        self.feed = MagicMock()
        self.feed.identifier = "https://darklegacycomics.com/feed.xml"
        self.feed.daily_limit = 5
        self.aggregator = DarkLegacyAggregator(self.feed)

    @patch("core.aggregators.website.fetch_html")
    def test_extract_content_dark_legacy(self, mock_fetch):
        # Read fixture
        with open("old/src/server/aggregators/__tests__/fixtures/dark_legacy.html", "r") as f:
            fixture_html = f.read()
        
        mock_fetch.return_value = fixture_html
        
        article = {
            "name": "Squatter",
            "identifier": "https://darklegacycomics.com/971",
        }
        
        # Test content extraction
        enriched = self.aggregator.enrich_articles([article])
        content = enriched[0]["content"]
        
        # Verify comic image is present
        # We now resolve relative URLs
        self.assertIn("https://darklegacycomics.com/comics/971.jpg", content)
        
        # Verify noise is removed (if we added any)
        self.assertNotIn("navigation narrow", content)
        self.assertNotIn("menu narrow", content)

if __name__ == "__main__":
    unittest.main()
