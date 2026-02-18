"""Tests for Twitter/X embed functionality."""

from unittest.mock import patch

from core.aggregators.utils.twitter import (
    _escape,
    _format_count,
    _format_tweet_date,
    build_tweet_embed_html,
)


class TestBuildTweetEmbedHtml:
    """Tests for build_tweet_embed_html()."""

    SAMPLE_TWEET_DATA = {
        "tweet": {
            "text": "This is a test tweet with some content.",
            "author": {
                "name": "Test User",
                "screen_name": "testuser",
            },
            "likes": 1234,
            "retweets": 567,
            "created_at": "Wed Jan 15 12:34:56 +0000 2026",
            "media": {
                "photos": [
                    {"url": "https://pbs.twimg.com/media/test1.jpg"},
                    {"url": "https://pbs.twimg.com/media/test2.jpg"},
                ],
            },
        },
    }

    @patch("core.aggregators.utils.twitter.fetch_tweet_data")
    def test_full_embed(self, mock_fetch):
        mock_fetch.return_value = self.SAMPLE_TWEET_DATA

        result = build_tweet_embed_html("https://x.com/testuser/status/123456")

        assert result is not None
        assert "<blockquote" in result
        assert "@testuser" in result
        assert "This is a test tweet" in result
        assert "View on X" in result
        assert "https://x.com/testuser/status/123456" in result
        assert "https://pbs.twimg.com/media/test1.jpg" in result
        assert "https://pbs.twimg.com/media/test2.jpg" in result
        assert "1.2K" in result  # likes
        assert "567" in result  # retweets
        assert "Jan 15, 2026" in result

    @patch("core.aggregators.utils.twitter.fetch_tweet_data")
    def test_embed_no_images(self, mock_fetch):
        data = {
            "tweet": {
                "text": "Text only tweet.",
                "author": {"name": "User", "screen_name": "user"},
                "likes": 0,
                "retweets": 0,
                "created_at": "",
                "media": {},
            },
        }
        mock_fetch.return_value = data

        result = build_tweet_embed_html("https://x.com/user/status/999")

        assert result is not None
        assert "Text only tweet." in result
        assert "<img" not in result

    @patch("core.aggregators.utils.twitter.fetch_tweet_data")
    def test_embed_no_engagement_stats(self, mock_fetch):
        data = {
            "tweet": {
                "text": "A tweet.",
                "author": {"name": "User", "screen_name": "user"},
                "likes": 0,
                "retweets": 0,
                "created_at": "",
                "media": {},
            },
        }
        mock_fetch.return_value = data

        result = build_tweet_embed_html("https://x.com/user/status/999")

        assert result is not None
        # No stats line when all zeros and no date
        assert "color: #536471" not in result

    @patch("core.aggregators.utils.twitter.fetch_tweet_data")
    def test_embed_strips_tracking_params(self, mock_fetch):
        mock_fetch.return_value = self.SAMPLE_TWEET_DATA

        result = build_tweet_embed_html("https://x.com/testuser/status/123456?s=20&t=abc")

        assert result is not None
        assert "?s=20" not in result
        assert "https://x.com/testuser/status/123456" in result

    @patch("core.aggregators.utils.twitter.fetch_tweet_data")
    def test_embed_escapes_html(self, mock_fetch):
        data = {
            "tweet": {
                "text": "Test <script>alert('xss')</script> & more",
                "author": {"name": "User", "screen_name": "user<bad>"},
                "likes": 0,
                "retweets": 0,
                "created_at": "",
                "media": {},
            },
        }
        mock_fetch.return_value = data

        result = build_tweet_embed_html("https://x.com/user/status/999")

        assert result is not None
        assert "<script>" not in result
        assert "&lt;script&gt;" in result
        assert "&amp; more" in result

    def test_embed_invalid_url(self):
        result = build_tweet_embed_html("https://example.com/not-a-tweet")
        assert result is None

    @patch("core.aggregators.utils.twitter.fetch_tweet_data")
    def test_embed_api_failure(self, mock_fetch):
        mock_fetch.return_value = None

        result = build_tweet_embed_html("https://x.com/user/status/123")
        assert result is None

    @patch("core.aggregators.utils.twitter.fetch_tweet_data")
    def test_embed_empty_tweet(self, mock_fetch):
        mock_fetch.return_value = {"tweet": {}}

        result = build_tweet_embed_html("https://x.com/user/status/123")

        # Empty dict is falsy, so returns None
        assert result is None

    @patch("core.aggregators.utils.twitter.fetch_tweet_data")
    def test_embed_minimal_tweet(self, mock_fetch):
        mock_fetch.return_value = {
            "tweet": {
                "text": "Hello",
                "author": {"screen_name": "user"},
            },
        }

        result = build_tweet_embed_html("https://x.com/user/status/123")

        assert result is not None
        assert "<blockquote" in result
        assert "Hello" in result

    @patch("core.aggregators.utils.twitter.fetch_tweet_data")
    def test_embed_twitter_com_url(self, mock_fetch):
        mock_fetch.return_value = self.SAMPLE_TWEET_DATA

        result = build_tweet_embed_html("https://twitter.com/testuser/status/123456")

        assert result is not None
        assert "https://twitter.com/testuser/status/123456" in result


class TestHelperFunctions:
    """Tests for helper functions."""

    def test_escape(self):
        assert _escape("<b>bold</b>") == "&lt;b&gt;bold&lt;/b&gt;"
        assert _escape('a "quote"') == "a &quot;quote&quot;"
        assert _escape("a & b") == "a &amp; b"
        assert _escape("normal text") == "normal text"

    def test_format_count(self):
        assert _format_count(0) == "0"
        assert _format_count(999) == "999"
        assert _format_count(1000) == "1.0K"
        assert _format_count(1234) == "1.2K"
        assert _format_count(999999) == "1000.0K"
        assert _format_count(1000000) == "1.0M"
        assert _format_count(1500000) == "1.5M"

    def test_format_tweet_date_valid(self):
        result = _format_tweet_date("Wed Jan 15 12:34:56 +0000 2026")
        assert result == "Jan 15, 2026"

    def test_format_tweet_date_invalid(self):
        assert _format_tweet_date("invalid date") is None
        assert _format_tweet_date("") is None
        assert _format_tweet_date(None) is None


class TestRedditContentTwitterIntegration:
    """Tests for Twitter/X handling in Reddit content building."""

    def test_process_link_media_twitter(self):
        """Twitter/X links are consumed but not added to body (embed is in header)."""
        from core.aggregators.reddit.content import _process_link_media
        from core.aggregators.reddit.types import RedditPostData

        post = RedditPostData(
            {
                "id": "test123",
                "title": "Check this tweet",
                "url": "https://x.com/user/status/123",
                "selftext": "",
                "author": "testuser",
                "permalink": "/r/test/comments/test123/check_this_tweet/",
                "created_utc": 1700000000,
                "num_comments": 5,
            }
        )

        content_parts = []
        result = _process_link_media(post, "https://x.com/user/status/123", content_parts)

        assert result is True
        assert len(content_parts) == 0  # Embed handled by header, not body

    def test_process_link_media_twitter_dot_com(self):
        """twitter.com links are also consumed for header embedding."""
        from core.aggregators.reddit.content import _process_link_media
        from core.aggregators.reddit.types import RedditPostData

        post = RedditPostData(
            {
                "id": "test123",
                "title": "Check this tweet",
                "url": "https://twitter.com/user/status/123",
                "selftext": "",
                "author": "testuser",
                "permalink": "/r/test/comments/test123/check_this_tweet/",
                "created_utc": 1700000000,
                "num_comments": 5,
            }
        )

        content_parts = []
        result = _process_link_media(post, "https://twitter.com/user/status/123", content_parts)

        assert result is True
        assert len(content_parts) == 0  # Embed handled by header, not body
