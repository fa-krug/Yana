import unittest
from unittest.mock import MagicMock, patch

from django.utils import timezone

from core.aggregators.youtube.aggregator import YouTubeAggregator


class TestYouTubeAggregator(unittest.TestCase):
    def setUp(self):
        self.feed = MagicMock()
        self.feed.identifier = "@mkbhd"
        self.feed.daily_limit = 5
        self.feed.user.id = 1
        self.aggregator = YouTubeAggregator(self.feed)

    @patch("core.models.UserSettings.objects.get")
    def test_get_client_success(self, mock_get_settings):
        mock_settings = MagicMock()
        mock_settings.youtube_enabled = True
        mock_settings.youtube_api_key = "valid_key"
        mock_get_settings.return_value = mock_settings

        client = self.aggregator._get_client()
        self.assertIsNotNone(client)
        self.assertEqual(client.api_key, "valid_key")

    def test_parse_to_raw_articles(self):
        source_data = {
            "channel_id": "UC123",
            "channel_title": "Test Channel",
            "videos": [
                {
                    "id": "vid1",
                    "snippet": {
                        "title": "Video 1",
                        "description": "Description 1",
                        "publishedAt": "2023-01-01T12:00:00Z",
                        "thumbnails": {"high": {"url": "https://thumb.url"}},
                    },
                }
            ],
        }

        articles = self.aggregator.parse_to_raw_articles(source_data)

        self.assertEqual(len(articles), 1)
        self.assertEqual(articles[0]["name"], "Video 1")
        self.assertEqual(articles[0]["_youtube_video_id"], "vid1")
        self.assertEqual(articles[0]["author"], "Test Channel")

    def test_build_content_html(self):
        description = "This is a video description.\nNew line."
        comments = [
            {
                "id": "comm1",
                "snippet": {
                    "topLevelComment": {
                        "snippet": {"authorDisplayName": "User1", "textDisplay": "Nice!"}
                    }
                },
            }
        ]

        html = self.aggregator._build_content_html(description, comments, "vid1")

        self.assertIn("This is a video description.<br>New line.", html)
        self.assertIn("User1", html)
        self.assertIn("https://www.youtube.com/watch?v=vid1&lc=comm1", html)
        self.assertIn("<h3>Comments</h3>", html)
        # Verify text is in HTML (textDisplay)
        self.assertIn("Nice!", html)

    @patch("core.aggregators.youtube.aggregator.create_youtube_embed_html")
    @patch("core.aggregators.youtube.aggregator.format_article_content")
    def test_finalize_articles(self, mock_format, mock_embed):
        mock_embed.return_value = "<iframe></iframe>"
        mock_format.return_value = "<html>Content</html>"

        articles = [
            {
                "name": "Video 1",
                "identifier": "https://youtube.com/watch?v=vid1",
                "content": "Description",
                "date": timezone.now(),
                "author": "Channel",
                "_youtube_video_id": "vid1",
            }
        ]

        finalized = self.aggregator.finalize_articles(articles)

        self.assertEqual(len(finalized), 1)
        self.assertEqual(finalized[0]["content"], "<iframe></iframe><html>Content</html>")
        mock_embed.assert_called_with("vid1")

    @patch("core.models.UserSettings.objects.get")
    @patch("core.aggregators.utils.youtube_client.YouTubeClient._get")
    def test_get_identifier_choices(self, mock_client_get, mock_get_settings):
        # Mock settings
        mock_settings = MagicMock()
        mock_settings.youtube_enabled = True
        mock_settings.youtube_api_key = "valid_key"
        mock_get_settings.return_value = mock_settings

        # Mock API response
        mock_client_get.return_value = {
            "items": [
                {
                    "id": {"channelId": "UC_MKBHD"},
                    "snippet": {"title": "MKBHD", "customUrl": "@mkbhd"},
                }
            ]
        }

        user = MagicMock()
        user.is_authenticated = True

        choices = YouTubeAggregator.get_identifier_choices(query="mkbhd", user=user)

        self.assertEqual(len(choices), 1)
        self.assertEqual(choices[0][0], "@mkbhd")
        self.assertEqual(choices[0][1], "MKBHD (@mkbhd)")
