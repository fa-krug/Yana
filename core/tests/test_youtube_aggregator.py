import unittest
from unittest.mock import MagicMock, patch
from datetime import datetime
from django.utils import timezone
from core.aggregators.youtube.aggregator import YouTubeAggregator
from core.aggregators.utils.youtube_client import YouTubeAPIError

class TestYouTubeAggregator(unittest.TestCase):
    def setUp(self):
        self.feed = MagicMock()
        self.feed.identifier = "@mkbhd"
        self.feed.daily_limit = 5
        self.feed.user.id = 1
        self.aggregator = YouTubeAggregator(self.feed)

    @patch('core.models.UserSettings.objects.get')
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
                        "thumbnails": {"high": {"url": "https://thumb.url"}}
                    }
                }
            ]
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
                "snippet": {
                    "topLevelComment": {
                        "snippet": {
                            "authorDisplayName": "User1",
                            "textDisplay": "Nice!"
                        }
                    }
                }
            }
        ]
        
        html = self.aggregator._build_content_html(description, comments)
        
        self.assertIn("This is a video description.<br>New line.", html)
        self.assertIn("User1", html)
        self.assertIn("Nice!", html)
        self.assertIn("<h3>Comments</h3>", html)

    @patch('core.aggregators.youtube.aggregator.create_youtube_embed_html')
    @patch('core.aggregators.youtube.aggregator.format_article_content')
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
                "_youtube_video_id": "vid1"
            }
        ]
        
        finalized = self.aggregator.finalize_articles(articles)
        
        self.assertEqual(len(finalized), 1)
        self.assertEqual(finalized[0]["content"], "<iframe></iframe><html>Content</html>")
        mock_embed.assert_called_with("vid1")
