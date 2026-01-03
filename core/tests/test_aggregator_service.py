from unittest.mock import MagicMock, patch

from django.core.exceptions import ObjectDoesNotExist

import pytest

from core.models import Article
from core.services.aggregator_service import AggregatorService


@pytest.mark.django_db
class TestAggregatorService:
    @patch("core.services.aggregator_service.get_aggregator")
    def test_trigger_by_feed_id_success(self, mock_get_agg, rss_feed):
        # Setup mock aggregator
        mock_aggregator = MagicMock()
        mock_aggregator.aggregate.return_value = [
            {
                "name": "New Article",
                "identifier": "https://example.com/new",
                "raw_content": "raw",
                "content": "clean",
                "author": "Author",
            }
        ]
        mock_aggregator.collect_feed_icon.return_value = None
        mock_get_agg.return_value = mock_aggregator

        # Act
        result = AggregatorService.trigger_by_feed_id(rss_feed.id)

        # Assert
        assert result["success"] is True
        assert result["articles_count"] == 1
        assert Article.objects.filter(feed=rss_feed, identifier="https://example.com/new").exists()

    def test_trigger_by_feed_id_disabled(self, rss_feed):
        rss_feed.enabled = False
        rss_feed.save()

        result = AggregatorService.trigger_by_feed_id(rss_feed.id)

        assert result["success"] is False
        assert result["error"] == "Feed is disabled"
        assert result["articles_count"] == 0

    def test_trigger_by_feed_id_not_found(self):
        with pytest.raises(ObjectDoesNotExist):
            AggregatorService.trigger_by_feed_id(9999)

    @patch("core.services.aggregator_service.get_aggregator")
    def test_trigger_by_feed_id_deduplication(self, mock_get_agg, rss_feed, article):
        # Setup mock aggregator to return existing article
        mock_aggregator = MagicMock()
        mock_aggregator.aggregate.return_value = [
            {
                "name": article.name,
                "identifier": article.identifier,
                "raw_content": "different raw",
                "content": "different clean",
            }
        ]
        mock_aggregator.collect_feed_icon.return_value = None
        mock_get_agg.return_value = mock_aggregator

        # Act
        result = AggregatorService.trigger_by_feed_id(rss_feed.id)

        # Assert
        assert result["success"] is True
        assert result["articles_count"] == 0  # Should not create new article
        assert Article.objects.filter(feed=rss_feed).count() == 1

    @patch("core.services.aggregator_service.get_aggregator")
    @patch("core.services.aggregator_service.HeaderElementFileHandler.save_image_to_article")
    def test_trigger_by_feed_id_with_header_image(self, mock_save_img, mock_get_agg, rss_feed):
        mock_header_data = MagicMock()
        mock_header_data.image_bytes = b"fake_image"
        mock_header_data.content_type = "image/jpeg"

        mock_aggregator = MagicMock()
        mock_aggregator.aggregate.return_value = [
            {"name": "Article with Image", "identifier": "img-1", "header_data": mock_header_data}
        ]
        mock_aggregator.collect_feed_icon.return_value = None
        mock_get_agg.return_value = mock_aggregator

        AggregatorService.trigger_by_feed_id(rss_feed.id)

        assert mock_save_img.called
        args, kwargs = mock_save_img.call_args
        assert args[1] == b"fake_image"
        assert args[2] == "image/jpeg"

    @patch("core.services.aggregator_service.get_aggregator")
    @patch("core.aggregators.services.feed_icon.file_handler.FeedIconFileHandler.save_icon_to_feed")
    @patch("core.aggregators.services.image_extraction.fetcher.fetch_single_image")
    def test_trigger_by_feed_id_feed_icon_update(
        self, mock_fetch, mock_save_icon, mock_get_agg, rss_feed
    ):
        mock_aggregator = MagicMock()
        mock_aggregator.aggregate.return_value = []
        mock_aggregator.collect_feed_icon.return_value = "https://example.com/icon.png"
        mock_get_agg.return_value = mock_aggregator

        mock_fetch.return_value = {"imageData": b"icon_data", "contentType": "image/png"}

        AggregatorService.trigger_by_feed_id(rss_feed.id)

        assert mock_fetch.called
        assert mock_save_icon.called

    @patch("core.services.aggregator_service.get_aggregator")
    def test_trigger_by_feed_id_aggregator_exception(self, mock_get_agg, rss_feed):
        mock_aggregator = MagicMock()
        mock_aggregator.aggregate.side_effect = Exception("Aggregation failed")
        mock_get_agg.return_value = mock_aggregator

        result = AggregatorService.trigger_by_feed_id(rss_feed.id)

        assert result["success"] is False
        assert "Aggregation failed" in result["error"]

    @patch("core.services.aggregator_service.AggregatorService.trigger_by_feed_id")
    def test_trigger_by_aggregator_type(self, mock_trigger, rss_feed):
        mock_trigger.return_value = {"success": True}

        results = AggregatorService.trigger_by_aggregator_type("rss")

        assert len(results) == 1
        assert mock_trigger.called

    @patch("core.services.aggregator_service.AggregatorService.trigger_by_feed_id")
    def test_trigger_all(self, mock_trigger, rss_feed, youtube_feed):
        mock_trigger.return_value = {"success": True}

        results = AggregatorService.trigger_all()

        assert len(results) == 2
        assert mock_trigger.call_count == 2
