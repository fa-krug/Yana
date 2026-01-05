from unittest.mock import patch

from django.utils import timezone

import pytest

from core.aggregators.podcast.aggregator import PodcastAggregator
from core.models import Feed


@pytest.mark.django_db
class TestPodcastAggregator:
    @pytest.fixture
    def podcast_feed(self, db):
        return Feed.objects.create(
            name="Podcast Feed",
            identifier="https://feeds.npr.org/510289/podcast.xml",
            daily_limit=5,
        )

    @pytest.fixture
    def aggregator(self, podcast_feed):
        return PodcastAggregator(podcast_feed)

    def test_parse_duration_to_seconds(self, aggregator):
        assert aggregator._parse_duration_to_seconds("01:02:03") == 3723
        assert aggregator._parse_duration_to_seconds("02:03") == 123
        assert aggregator._parse_duration_to_seconds("3600") == 3600
        assert aggregator._parse_duration_to_seconds("invalid") is None
        assert aggregator._parse_duration_to_seconds("") is None

    def test_format_duration(self, aggregator):
        assert aggregator._format_duration(3723) == "1:02:03"
        assert aggregator._format_duration(123) == "2:03"
        assert aggregator._format_duration(59) == "0:59"

    def test_parse_to_raw_articles_podcast(self, aggregator):
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

        # Mock time to ensure limit allows fetching
        midday = timezone.now().replace(hour=12, minute=0, second=0, microsecond=0)

        with patch("django.utils.timezone.now", return_value=midday):
            articles = aggregator.parse_to_raw_articles(source_data)

        assert len(articles) == 1
        assert articles[0]["name"] == "Episode 1"
        assert articles[0]["_media_url"] == "https://example.com/ep1.mp3"
        assert articles[0]["_duration"] == 1800
        assert articles[0]["_image_url"] == "https://example.com/art.jpg"

    def test_enrich_articles_builds_player(self, aggregator):
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

        enriched = aggregator.enrich_articles(articles)
        content = enriched[0]["content"]

        assert "<audio controls" in content
        assert 'src="https://example.com/ep1.mp3"' in content
        assert "30:00" in content
        assert 'src="https://example.com/art.jpg"' in content
        assert "Original Summary" in content
