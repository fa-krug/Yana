from unittest.mock import patch

import pytest

from core.aggregators.tagesschau.aggregator import TagesschauAggregator


@pytest.mark.django_db
class TestTagesschauAggregator:
    @pytest.fixture
    def tages_agg(self, rss_feed):
        rss_feed.aggregator = "tagesschau"
        rss_feed.identifier = "https://www.tagesschau.de/infoservices/alle-meldungen-100~rss2.xml"
        return TagesschauAggregator(rss_feed)

    def test_default_identifier(self, rss_feed):
        rss_feed.identifier = ""
        agg = TagesschauAggregator(rss_feed)
        assert (
            agg.identifier == "https://www.tagesschau.de/infoservices/alle-meldungen-100~rss2.xml"
        )

    def test_filter_articles_skips_livestream(self, tages_agg):
        articles = [
            {"name": "Normal News", "identifier": "url1", "date": None},
            {"name": "Livestream: Corona", "identifier": "url2", "date": None},
        ]
        with patch(
            "core.aggregators.website.FullWebsiteAggregator.filter_articles",
            side_effect=lambda x: x,
        ):
            filtered = tages_agg.filter_articles(articles)

        assert len(filtered) == 1
        assert filtered[0]["name"] == "Normal News"

    def test_filter_articles_skips_podcasts(self, tages_agg):
        articles = [
            {"name": "Normal News", "identifier": "url1", "date": None},
            {"name": "11KM-Podcast: Topic", "identifier": "url2", "date": None},
        ]
        with patch(
            "core.aggregators.website.FullWebsiteAggregator.filter_articles",
            side_effect=lambda x: x,
        ):
            filtered = tages_agg.filter_articles(articles)

        assert len(filtered) == 1
        assert filtered[0]["name"] == "Normal News"

    @patch("core.aggregators.tagesschau.aggregator.extract_tagesschau_content")
    def test_extract_content(self, mock_extract, tages_agg):
        mock_extract.return_value = "Specialized Content"
        result = tages_agg.extract_content("<html></html>", {"name": "Test"})
        assert result == "Specialized Content"
        mock_extract.assert_called_once()

    @patch("core.aggregators.tagesschau.aggregator.extract_media_header")
    def test_process_content_adds_media_header(self, mock_media, tages_agg):
        mock_media.return_value = "<video>Header</video>"

        with patch(
            "core.aggregators.website.FullWebsiteAggregator.process_content",
            side_effect=lambda x, y: x,
        ):
            processed = tages_agg.process_content("Body", {"name": "Test", "raw_content": "raw"})

        assert "<video>Header</video>Body" in processed
