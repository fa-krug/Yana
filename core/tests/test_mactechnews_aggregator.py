import unittest
from unittest.mock import MagicMock, patch

from core.aggregators.mactechnews.aggregator import MactechnewsAggregator


class TestMactechnewsAggregator(unittest.TestCase):
    def setUp(self):
        self.feed = MagicMock()
        self.feed.identifier = "https://www.mactechnews.de/Rss/News.x"
        self.feed.daily_limit = 5
        self.feed.options = {}
        self.aggregator = MactechnewsAggregator(self.feed)

    @patch("core.aggregators.website.FullWebsiteAggregator.extract_header_element")
    @patch("core.aggregators.website.fetch_html")
    def test_extract_content_mactechnews(self, mock_fetch, mock_header):
        # Mock header extraction
        mock_header.return_value = None

        # Read fixture
        with open("core/tests/fixtures/mactechnews.html", "r") as f:
            fixture_html = f.read()

        mock_fetch.return_value = fixture_html

        article = {
            "name": "Kurztest Dan Clark Audio Noire XO",
            "identifier": "https://www.mactechnews.de/news/article/Kurztest-Dan-Clark-Audio-Noire-XO-186238.html",
            "content": "",
        }

        # Test content extraction
        enriched = self.aggregator.enrich_articles([article])
        content = enriched[0]["content"]

        # Verify content from .MtnArticle is present
        self.assertIn("Kurztest Dan Clark Audio Noire XO", content)
        self.assertIn("Gleicher Klang für weniger Geld?", content)

        # Verify noise is removed
        self.assertNotIn("NewsPictureMobile", content)
        self.assertNotIn("google-analytics.com", content)


if __name__ == "__main__":
    unittest.main()
