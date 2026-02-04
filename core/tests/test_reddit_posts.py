"""Tests for Reddit post fetching via PRAW."""

from unittest.mock import MagicMock, patch

import prawcore.exceptions
import pytest

from core.aggregators.reddit.posts import fetch_reddit_post


def _make_mock_submission():
    """Create a mock PRAW Submission with standard attributes."""
    mock = MagicMock()
    mock.id = "abc123"
    mock.title = "Test Post Title"
    mock.author.name = "test_user"
    mock.selftext = "This is the post body"
    mock.selftext_html = "<p>This is the post body</p>"
    mock.url = "https://reddit.com/r/python/comments/abc123/"
    mock.permalink = "/r/python/comments/abc123/test_post/"
    mock.created_utc = 1704024000.0
    mock.score = 150
    mock.num_comments = 42
    mock.is_self = True
    mock.is_video = False
    mock.is_gallery = False
    mock.thumbnail = "self"
    mock.preview = None
    mock.media = None
    mock.media_metadata = None
    mock.gallery_data = None
    mock.crosspost_parent_list = None
    return mock


def _make_mock_submission_raising(exception):
    """Create a mock PRAW Submission that raises on .title access.

    Uses a dedicated class to avoid polluting MagicMock's class-level attributes.
    """

    class RaisingSubmission(MagicMock):
        @property
        def title(self):
            raise exception

    return RaisingSubmission()


class TestFetchRedditPost:
    """Test fetch_reddit_post() function."""

    @patch("core.aggregators.reddit.posts.get_praw_instance")
    def test_successful_fetch(self, mock_get_praw):
        """Test successful post fetch returns RedditPostData."""
        mock_submission = _make_mock_submission()
        mock_reddit = MagicMock()
        mock_reddit.submission.return_value = mock_submission
        mock_get_praw.return_value = mock_reddit

        result = fetch_reddit_post("python", "abc123", user_id=1)

        assert result is not None
        assert result.id == "abc123"
        assert result.title == "Test Post Title"
        assert result.author == "test_user"
        assert result.selftext == "This is the post body"
        assert result.score == 150
        assert result.num_comments == 42
        assert result.is_self is True

    @patch("core.aggregators.reddit.posts.get_praw_instance")
    def test_successful_fetch_calls_praw_correctly(self, mock_get_praw):
        """Test that PRAW is called with the correct post ID."""
        mock_submission = _make_mock_submission()
        mock_reddit = MagicMock()
        mock_reddit.submission.return_value = mock_submission
        mock_get_praw.return_value = mock_reddit

        fetch_reddit_post("python", "abc123", user_id=1)

        mock_get_praw.assert_called_once_with(1)
        mock_reddit.submission.assert_called_once_with(id="abc123")

    @patch("core.aggregators.reddit.posts.get_praw_instance")
    def test_subreddit_param_not_used_by_praw(self, mock_get_praw):
        """Test that subreddit parameter is accepted but not passed to PRAW."""
        mock_submission = _make_mock_submission()
        mock_reddit = MagicMock()
        mock_reddit.submission.return_value = mock_submission
        mock_get_praw.return_value = mock_reddit

        # Call with different subreddit values - should not affect the call
        fetch_reddit_post("differentsubreddit", "abc123", user_id=1)

        # PRAW is called with post ID only, not subreddit
        mock_reddit.submission.assert_called_once_with(id="abc123")

    @patch("core.aggregators.reddit.posts.get_praw_instance")
    def test_returns_reddit_post_data_type(self, mock_get_praw):
        """Test that the return type is RedditPostData."""
        from core.aggregators.reddit.types import RedditPostData

        mock_submission = _make_mock_submission()
        mock_reddit = MagicMock()
        mock_reddit.submission.return_value = mock_submission
        mock_get_praw.return_value = mock_reddit

        result = fetch_reddit_post("python", "abc123", user_id=1)

        assert isinstance(result, RedditPostData)

    @patch("core.aggregators.reddit.posts.get_praw_instance")
    def test_not_found_returns_none(self, mock_get_praw):
        """Test that NotFound exception returns None."""
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_submission = _make_mock_submission_raising(prawcore.exceptions.NotFound(mock_response))
        mock_reddit = MagicMock()
        mock_reddit.submission.return_value = mock_submission
        mock_get_praw.return_value = mock_reddit

        result = fetch_reddit_post("python", "nonexistent", user_id=1)

        assert result is None

    @patch("core.aggregators.reddit.posts.get_praw_instance")
    def test_forbidden_returns_none(self, mock_get_praw):
        """Test that Forbidden exception returns None."""
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_submission = _make_mock_submission_raising(
            prawcore.exceptions.Forbidden(mock_response)
        )
        mock_reddit = MagicMock()
        mock_reddit.submission.return_value = mock_submission
        mock_get_praw.return_value = mock_reddit

        result = fetch_reddit_post("private_sub", "secret_post", user_id=1)

        assert result is None

    @patch("core.aggregators.reddit.posts.get_praw_instance")
    def test_auth_failure_raises_value_error(self, mock_get_praw):
        """Test that 401 ResponseException raises ValueError."""
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_submission = _make_mock_submission_raising(
            prawcore.exceptions.ResponseException(mock_response)
        )
        mock_reddit = MagicMock()
        mock_reddit.submission.return_value = mock_submission
        mock_get_praw.return_value = mock_reddit

        with pytest.raises(ValueError, match="Reddit authentication failed"):
            fetch_reddit_post("python", "abc123", user_id=1)

    @patch("core.aggregators.reddit.posts.get_praw_instance")
    def test_other_response_exception_returns_none(self, mock_get_praw):
        """Test that non-401 ResponseException returns None."""
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_submission = _make_mock_submission_raising(
            prawcore.exceptions.ResponseException(mock_response)
        )
        mock_reddit = MagicMock()
        mock_reddit.submission.return_value = mock_submission
        mock_get_praw.return_value = mock_reddit

        result = fetch_reddit_post("python", "abc123", user_id=1)

        assert result is None

    @patch("core.aggregators.reddit.posts.get_praw_instance")
    def test_unexpected_exception_returns_none(self, mock_get_praw):
        """Test that unexpected exceptions return None."""
        mock_submission = _make_mock_submission_raising(RuntimeError("Network error"))
        mock_reddit = MagicMock()
        mock_reddit.submission.return_value = mock_submission
        mock_get_praw.return_value = mock_reddit

        result = fetch_reddit_post("python", "abc123", user_id=1)

        assert result is None

    @patch("core.aggregators.reddit.posts.get_praw_instance")
    def test_praw_instance_credentials_error_raises_value_error(self, mock_get_praw):
        """Test that ValueError from get_praw_instance (missing credentials) is re-raised."""
        mock_get_praw.side_effect = ValueError("Reddit API credentials not configured")

        with pytest.raises(ValueError, match="Reddit API credentials not configured"):
            fetch_reddit_post("python", "abc123", user_id=1)

    @patch("core.aggregators.reddit.posts.get_praw_instance")
    def test_praw_instance_not_enabled_raises_value_error(self, mock_get_praw):
        """Test that ValueError from get_praw_instance (not enabled) is re-raised."""
        mock_get_praw.side_effect = ValueError("Reddit is not enabled")

        with pytest.raises(ValueError, match="Reddit is not enabled"):
            fetch_reddit_post("python", "abc123", user_id=1)

    @patch("core.aggregators.reddit.posts.get_praw_instance")
    def test_deleted_author_post(self, mock_get_praw):
        """Test fetching a post where the author has been deleted."""
        mock_submission = _make_mock_submission()
        mock_submission.author = None  # Deleted author
        mock_reddit = MagicMock()
        mock_reddit.submission.return_value = mock_submission
        mock_get_praw.return_value = mock_reddit

        result = fetch_reddit_post("python", "abc123", user_id=1)

        assert result is not None
        assert result.author == "[deleted]"

    @patch("core.aggregators.reddit.posts.get_praw_instance")
    def test_gallery_post(self, mock_get_praw):
        """Test fetching a gallery post preserves gallery data."""
        mock_submission = _make_mock_submission()
        mock_submission.is_self = False
        mock_submission.is_gallery = True
        mock_submission.media_metadata = {
            "img1": {"s": {"u": "https://i.redd.it/img1.jpg"}},
        }
        mock_submission.gallery_data = {
            "items": [{"media_id": "img1"}],
        }
        mock_reddit = MagicMock()
        mock_reddit.submission.return_value = mock_submission
        mock_get_praw.return_value = mock_reddit

        result = fetch_reddit_post("python", "gallery123", user_id=1)

        assert result is not None
        assert result.is_gallery is True
        assert result.media_metadata is not None
        assert result.gallery_data is not None

    @patch("core.aggregators.reddit.posts.get_praw_instance")
    def test_video_post(self, mock_get_praw):
        """Test fetching a video post preserves media data."""
        mock_submission = _make_mock_submission()
        mock_submission.is_self = False
        mock_submission.is_video = True
        mock_submission.media = {
            "reddit_video": {"fallback_url": "https://v.redd.it/video123/DASH_720.mp4"}
        }
        mock_reddit = MagicMock()
        mock_reddit.submission.return_value = mock_submission
        mock_get_praw.return_value = mock_reddit

        result = fetch_reddit_post("python", "video123", user_id=1)

        assert result is not None
        assert result.is_video is True
        assert result.media is not None
        assert "reddit_video" in result.media


class TestFetchRedditPostSignature:
    """Test that the function signature is backward compatible."""

    def test_function_accepts_three_positional_args(self):
        """Verify the function signature accepts (subreddit, post_id, user_id)."""
        import inspect

        sig = inspect.signature(fetch_reddit_post)
        params = list(sig.parameters.keys())

        assert params == ["subreddit", "post_id", "user_id"]

    def test_return_annotation(self):
        """Verify the return type annotation."""
        import inspect

        from core.aggregators.reddit.types import RedditPostData

        sig = inspect.signature(fetch_reddit_post)
        assert sig.return_annotation == RedditPostData | None
