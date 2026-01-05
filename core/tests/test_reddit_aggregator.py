import time
from unittest.mock import MagicMock, patch

import pytest
import requests

from core.aggregators.reddit.aggregator import RedditAggregator
from core.aggregators.reddit.auth import _token_cache, get_reddit_access_token


@pytest.mark.django_db
class TestRedditAggregator:
    @pytest.fixture
    def reddit_agg(self, reddit_feed, user_with_settings):
        return RedditAggregator(reddit_feed)

    def test_validate_success(self, reddit_agg):
        reddit_agg.validate()  # Should not raise

    def test_validate_no_user(self, reddit_feed):
        reddit_feed.user = None
        agg = RedditAggregator(reddit_feed)
        with pytest.raises(ValueError, match="Feed must have a user"):
            agg.validate()

    def test_validate_not_enabled(self, reddit_agg, user_with_settings):
        user_with_settings.user_settings.reddit_enabled = False
        user_with_settings.user_settings.save()
        with pytest.raises(ValueError, match="Reddit is not enabled"):
            reddit_agg.validate()

    @patch("core.aggregators.reddit.aggregator.requests.get")
    @patch("core.aggregators.reddit.aggregator.get_reddit_auth_headers")
    @patch("core.aggregators.reddit.aggregator.fetch_subreddit_info")
    def test_fetch_source_data(
        self, mock_info, mock_headers, mock_get, reddit_agg, mock_reddit_response
    ):
        mock_headers.return_value = {"Authorization": "Bearer token"}
        mock_info.return_value = {"iconUrl": "https://example.com/icon.png"}

        mock_response = MagicMock()
        mock_response.json.return_value = mock_reddit_response
        mock_get.return_value = mock_response

        data = reddit_agg.fetch_source_data(limit=1)

        assert "posts" in data
        assert len(data["posts"]) == 1
        assert data["posts"][0].data.title == "Reddit Post 1"
        assert reddit_agg.subreddit_icon_url == "https://example.com/icon.png"

    def test_parse_to_raw_articles(self, reddit_agg, mock_reddit_response):
        from core.aggregators.reddit.types import RedditPost

        posts = [RedditPost(mock_reddit_response["data"]["children"][0])]
        source_data = {"posts": posts, "subreddit": "python"}

        articles = reddit_agg.parse_to_raw_articles(source_data)

        assert len(articles) == 1
        assert articles[0]["name"] == "Reddit Post 1"
        assert articles[0]["author"] == "user1"
        assert "reddit.com/r/python/post1" in articles[0]["identifier"]

    def test_filter_articles(self, reddit_agg):
        from datetime import timedelta

        from django.utils import timezone

        articles = [
            {"name": "Good", "author": "user1", "date": timezone.now(), "_reddit_num_comments": 10},
            {"name": "AutoMod", "author": "AutoModerator", "date": timezone.now()},
            {"name": "Old", "author": "user2", "date": timezone.now() - timedelta(days=70)},
            {
                "name": "Few comments",
                "author": "user3",
                "date": timezone.now(),
                "_reddit_num_comments": 2,
            },
        ]

        filtered = reddit_agg.filter_articles(articles)

        assert len(filtered) == 1
        assert filtered[0]["name"] == "Good"

    @patch("core.aggregators.reddit.aggregator.build_post_content")
    def test_enrich_articles(self, mock_build, reddit_agg):
        mock_build.return_value = "<html>Content</html>"
        articles = [
            {
                "name": "Post",
                "identifier": "url",
                "_reddit_post_data": {"id": "1"},
                "_reddit_subreddit": "python",
            }
        ]

        enriched = reddit_agg.enrich_articles(articles)

        assert enriched[0]["content"] == "<html>Content</html>"

    def test_get_original_post_data_cross_post(self, reddit_agg):
        from core.aggregators.reddit.types import RedditPostData

        data = {"id": "cross", "crosspost_parent_list": [{"id": "original", "title": "Original"}]}
        post_data = RedditPostData(data)
        original = reddit_agg._get_original_post_data(post_data)
        assert original.id == "original"
        assert original.title == "Original"

    @patch("core.aggregators.reddit.aggregator.requests.get")
    @patch("core.aggregators.reddit.aggregator.get_reddit_auth_headers")
    def test_fetch_source_data_404(self, mock_headers, mock_get, reddit_agg):
        mock_headers.return_value = {}
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_response.raise_for_status.side_effect = requests.exceptions.HTTPError(
            response=mock_response
        )
        mock_get.return_value = mock_response

        with pytest.raises(ValueError, match="does not exist"):
            reddit_agg.fetch_source_data()

    @patch("core.aggregators.reddit.aggregator.requests.get")
    @patch("core.aggregators.reddit.aggregator.get_reddit_auth_headers")
    @patch("core.aggregators.reddit.aggregator.fetch_subreddit_info")
    def test_daily_limit_exceeded(self, mock_info, mock_headers, mock_get, reddit_agg):
        from django.utils import timezone

        mock_headers.return_value = {"Authorization": "Bearer token"}
        mock_info.return_value = {"iconUrl": "https://example.com/icon.png"}
        reddit_agg.daily_limit = 2

        # Create 5 posts
        children = []
        for i in range(5):
            children.append(
                {
                    "data": {
                        "id": f"post{i}",
                        "title": f"Post {i}",
                        "author": "user1",
                        "permalink": f"/r/python/post{i}",
                        "url": "https://url.com",
                        "created_utc": 1700000000 + i,
                        "num_comments": 10,
                        "crosspost_parent_list": [],
                        "is_video": False,
                    }
                }
            )

        mock_response_data = {"data": {"children": children}}
        mock_response = MagicMock()
        mock_response.json.return_value = mock_response_data
        mock_get.return_value = mock_response

        # Mock time to late evening (23:00) so target quota is near 100%
        late_evening = timezone.now().replace(hour=23, minute=0, second=0, microsecond=0)

        with (
            patch("django.utils.timezone.now", return_value=late_evening),
            patch.object(reddit_agg, "filter_articles", side_effect=lambda x: x),
            patch.object(reddit_agg, "enrich_articles", side_effect=lambda x: x),
        ):
            articles = reddit_agg.aggregate()

        assert len(articles) == 2

    @patch("core.aggregators.reddit.aggregator.requests.get")
    @patch("core.aggregators.reddit.aggregator.get_reddit_auth_headers")
    @patch("core.aggregators.reddit.aggregator.fetch_subreddit_info")
    def test_daily_limit_under_limit(self, mock_info, mock_headers, mock_get, reddit_agg):
        mock_headers.return_value = {"Authorization": "Bearer token"}
        mock_info.return_value = {"iconUrl": "https://example.com/icon.png"}
        reddit_agg.daily_limit = 5

        # Create 2 posts
        children = []
        for i in range(2):
            children.append(
                {
                    "data": {
                        "id": f"post{i}",
                        "title": f"Post {i}",
                        "author": "user1",
                        "permalink": f"/r/python/post{i}",
                        "url": "https://url.com",
                        "created_utc": 1700000000 + i,
                        "num_comments": 10,
                        "crosspost_parent_list": [],
                        "is_video": False,
                    }
                }
            )

        mock_response_data = {"data": {"children": children}}
        mock_response = MagicMock()
        mock_response.json.return_value = mock_response_data
        mock_get.return_value = mock_response

        # Mock filter_articles to return only 1
        with (
            patch.object(reddit_agg, "filter_articles", return_value=[{"name": "Only One"}]),
            patch.object(reddit_agg, "enrich_articles", side_effect=lambda x: x),
        ):
            articles = reddit_agg.aggregate()

        assert len(articles) == 1
        assert articles[0]["name"] == "Only One"


@pytest.mark.django_db
class TestRedditAuth:
    def test_get_reddit_user_settings(self, user_with_settings):
        from core.aggregators.reddit.auth import get_reddit_user_settings

        settings = get_reddit_user_settings(user_with_settings.id)
        assert settings["reddit_enabled"] is True
        assert settings["reddit_client_id"] == "test_client_id"

    @patch("core.aggregators.reddit.auth.requests.post")
    def test_get_reddit_access_token_success(self, mock_post, user_with_settings):
        # Clear cache
        _token_cache.clear()

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "access_token": "new_token",
            "token_type": "bearer",
            "expires_in": 3600,
        }
        mock_post.return_value = mock_response

        token = get_reddit_access_token(user_with_settings.id)

        assert token == "new_token"
        assert user_with_settings.id in _token_cache

    def test_get_reddit_access_token_cache(self, user_with_settings):
        _token_cache[user_with_settings.id] = {
            "token": "cached_token",
            "expires_at": time.time() + 1000,
        }

        token = get_reddit_access_token(user_with_settings.id)
        assert token == "cached_token"
