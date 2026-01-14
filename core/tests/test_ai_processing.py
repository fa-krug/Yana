import json
from unittest.mock import MagicMock, patch

from django.contrib.auth.models import User

import pytest

from core.aggregators.base import BaseAggregator
from core.models import Feed, UserSettings


# Concrete implementation for testing
class TestAggregator(BaseAggregator):
    def fetch_source_data(self, limit=None):
        return []

    def parse_to_raw_articles(self, source_data):
        return []

    def aggregate(self):
        return []


@pytest.mark.django_db
class TestAIProcessing:
    @pytest.fixture
    def user(self):
        return User.objects.create_user(username="testuser", password="password")

    @pytest.fixture
    def user_settings(self, user):
        settings = UserSettings.objects.create(
            user=user,
            active_ai_provider="openai",
            openai_enabled=True,
            openai_api_key="sk-test",
            openai_model="gpt-4o-mini",
        )
        return settings

    @pytest.fixture
    def feed(self, user):
        return Feed.objects.create(
            name="Test Feed",
            identifier="http://example.com/feed",
            user=user,
            options={"ai_translate": True, "ai_translate_language": "German"},
        )

    @pytest.fixture
    def aggregator(self, feed):
        return TestAggregator(feed)

    @patch("core.aggregators.base.AIClient")
    def test_ai_translation_title_and_content(self, mock_ai_client_cls, aggregator, user_settings):
        # Setup mock
        mock_ai_instance = MagicMock()
        mock_ai_client_cls.return_value = mock_ai_instance

        # expected JSON response
        ai_response = json.dumps(
            {"title": "Übersetzter Titel", "content": "<p>Übersetzter Inhalt</p>"}
        )
        mock_ai_instance.generate_response.return_value = ai_response

        # Article to process
        article = {
            "name": "Original Title",
            "content": "<p>Original Content</p>",
            "identifier": "http://example.com/1",
        }

        # Run processing
        results = aggregator._apply_ai_processing([article])

        # Assertions
        assert len(results) == 1
        processed_article = results[0]

        # Verify prompt structure (should contain JSON instructions in the new implementation)
        # For now, we just check if it updated correctly.
        # Since we haven't implemented the fix yet, this is expected to fail or behave unexpectedly
        # (e.g., content might become the JSON string, title unchanged)

        assert processed_article["name"] == "Übersetzter Titel"
        assert processed_article["content"] == "<p>Übersetzter Inhalt</p>"

    @patch("core.aggregators.base.AIClient")
    def test_ai_processing_json_failure(self, mock_ai_client_cls, aggregator, user_settings):
        # Setup mock
        mock_ai_instance = MagicMock()
        mock_ai_client_cls.return_value = mock_ai_instance

        # Invalid JSON response
        mock_ai_instance.generate_response.return_value = "Not valid JSON"

        article = {
            "name": "Original Title",
            "content": "<p>Original Content</p>",
            "identifier": "http://example.com/1",
        }

        # Run processing
        results = aggregator._apply_ai_processing([article])

        # Assertions - should skip update or fallback
        # The implementation skips the article if AI processing fails (including JSON errors)
        assert len(results) == 0
