import unittest
from unittest.mock import MagicMock

from django.utils import timezone

from core.aggregators.podcast.aggregator import PodcastAggregator


class TestPodcastAggregator(unittest.TestCase):
    def setUp(self):
        self.feed = MagicMock()
        self.feed.identifier = "https://feeds.npr.org/510289/podcast.xml"
        self.feed.daily_limit = 5
        self.aggregator = PodcastAggregator(self.feed)

    def test_parse_duration_to_seconds(self):
        self.assertEqual(self.aggregator._parse_duration_to_seconds("01:02:03"), 3723)
        self.assertEqual(self.aggregator._parse_duration_to_seconds("02:03"), 123)
        self.assertEqual(self.aggregator._parse_duration_to_seconds("3600"), 3600)
        self.assertIsNone(self.aggregator._parse_duration_to_seconds("invalid"))
        self.assertIsNone(self.aggregator._parse_duration_to_seconds(""))

    def test_format_duration(self):
        self.assertEqual(self.aggregator._format_duration(3723), "1:02:03")
        self.assertEqual(self.aggregator._format_duration(123), "2:03")
        self.assertEqual(self.aggregator._format_duration(59), "0:59")

    def test_parse_to_raw_articles_podcast(self):
        source_data = {
            "entries": [
                {
                    "title": "Episode 1",
                    "link": "https://example.com/ep1",
                    "published": "Fri, 12 Dec 2025 18:59:37 -0500",
                    "summary": "Summary 1",
                    "enclosures": [{"url": "https://example.com/ep1.mp3", "type": "audio/mpeg"}],
                    "itunes_duration": "00:30:00",
                    "itunes_image": {"href": "https://example.com/art.jpg"},
                },
                {
                    "title": "No Audio",
                    "link": "https://example.com/no-audio",
                    "enclosures": [],
                },
            ]
        }

        articles = self.aggregator.parse_to_raw_articles(source_data)

        self.assertEqual(len(articles), 1)
        self.assertEqual(articles[0]["name"], "Episode 1")
        self.assertEqual(articles[0]["_media_url"], "https://example.com/ep1.mp3")
        self.assertEqual(articles[0]["_duration"], 1800)
        self.assertEqual(articles[0]["_image_url"], "https://example.com/art.jpg")

    def test_enrich_articles_builds_player(self):
        articles = [
            {
                "name": "Episode 1",
                "identifier": "https://example.com/ep1",
                "content": "Original Summary",
                "date": timezone.now(),
                "_media_url": "https://example.com/ep1.mp3",
                "_media_type": "audio/mpeg",
                "_duration": 1800,
                "_image_url": "https://example.com/art.jpg",
            }
        ]

        enriched = self.aggregator.enrich_articles(articles)
        content = enriched[0]["content"]

        self.assertIn("<audio controls", content)
        self.assertIn('src="https://example.com/ep1.mp3"', content)
        self.assertIn("30:00", content)
        self.assertIn('src="https://example.com/art.jpg"', content)
        self.assertIn("Original Summary", content)


if __name__ == "__main__":
    unittest.main()
