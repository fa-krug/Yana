"""Tests for Reddit type conversion methods."""

from unittest.mock import MagicMock

from core.aggregators.reddit.types import RedditComment, RedditPostData


class TestRedditPostDataFromPraw:
    """Test RedditPostData.from_praw() conversion."""

    def test_basic_submission_conversion(self):
        """Test converting a basic PRAW submission with all fields."""
        mock_submission = MagicMock()
        mock_submission.id = "abc123"
        mock_submission.title = "Test Post Title"
        mock_submission.author.name = "test_user"
        mock_submission.selftext = "This is the post body"
        mock_submission.selftext_html = "<p>This is the post body</p>"
        mock_submission.url = "https://reddit.com/r/test/comments/abc123/"
        mock_submission.permalink = "/r/test/comments/abc123/test_post/"
        mock_submission.created_utc = 1704024000.0
        mock_submission.score = 150
        mock_submission.num_comments = 42
        mock_submission.is_self = True
        mock_submission.is_video = False
        mock_submission.is_gallery = False
        mock_submission.thumbnail = "self"
        mock_submission.preview = None
        mock_submission.media = None
        mock_submission.media_metadata = None
        mock_submission.gallery_data = None
        mock_submission.crosspost_parent_list = None

        result = RedditPostData.from_praw(mock_submission)

        assert result.id == "abc123"
        assert result.title == "Test Post Title"
        assert result.author == "test_user"
        assert result.selftext == "This is the post body"
        assert result.selftext_html == "<p>This is the post body</p>"
        assert result.url == "https://reddit.com/r/test/comments/abc123/"
        assert result.permalink == "/r/test/comments/abc123/test_post/"
        assert result.created_utc == 1704024000.0
        assert result.score == 150
        assert result.num_comments == 42
        assert result.is_self is True
        assert result.is_video is False
        assert result.is_gallery is False
        assert result.thumbnail == "self"
        assert result.preview is None
        assert result.media is None

    def test_deleted_author_handling(self):
        """Test that deleted posts (author=None) are handled with '[deleted]'."""
        mock_submission = MagicMock()
        mock_submission.id = "deleted_post"
        mock_submission.title = "Deleted Post"
        mock_submission.author = None  # Author deleted their account
        mock_submission.selftext = "[deleted]"
        mock_submission.selftext_html = None
        mock_submission.url = "https://reddit.com/r/test/comments/deleted/"
        mock_submission.permalink = "/r/test/comments/deleted/"
        mock_submission.created_utc = 1704024000.0
        mock_submission.score = 0
        mock_submission.num_comments = 0
        mock_submission.is_self = True
        mock_submission.is_video = False
        mock_submission.thumbnail = "self"
        mock_submission.media = None

        result = RedditPostData.from_praw(mock_submission)

        assert result.author == "[deleted]"

    def test_link_post_conversion(self):
        """Test converting a link post (not self-post)."""
        mock_submission = MagicMock()
        mock_submission.id = "link_post"
        mock_submission.title = "Check out this link"
        mock_submission.author.name = "link_poster"
        mock_submission.selftext = ""  # Link posts have empty selftext
        mock_submission.selftext_html = None
        mock_submission.url = "https://example.com/article"
        mock_submission.permalink = "/r/test/comments/link_post/"
        mock_submission.created_utc = 1704024000.0
        mock_submission.score = 500
        mock_submission.num_comments = 100
        mock_submission.is_self = False
        mock_submission.is_video = False
        mock_submission.thumbnail = "https://i.redd.it/thumb.jpg"
        mock_submission.media = None

        result = RedditPostData.from_praw(mock_submission)

        assert result.is_self is False
        assert result.url == "https://example.com/article"
        assert result.selftext == ""

    def test_video_post_conversion(self):
        """Test converting a video post with media data."""
        mock_submission = MagicMock()
        mock_submission.id = "video_post"
        mock_submission.title = "Video Post"
        mock_submission.author.name = "video_poster"
        mock_submission.selftext = ""
        mock_submission.selftext_html = None
        mock_submission.url = "https://v.redd.it/video123"
        mock_submission.permalink = "/r/test/comments/video_post/"
        mock_submission.created_utc = 1704024000.0
        mock_submission.score = 300
        mock_submission.num_comments = 50
        mock_submission.is_self = False
        mock_submission.is_video = True
        mock_submission.thumbnail = "https://i.redd.it/video_thumb.jpg"
        mock_submission.media = {
            "reddit_video": {"fallback_url": "https://v.redd.it/video123/DASH_720.mp4"}
        }

        result = RedditPostData.from_praw(mock_submission)

        assert result.is_video is True
        assert result.media == {
            "reddit_video": {"fallback_url": "https://v.redd.it/video123/DASH_720.mp4"}
        }

    def test_gallery_post_conversion(self):
        """Test converting a gallery post with media_metadata and gallery_data."""
        mock_submission = MagicMock()
        mock_submission.id = "gallery_post"
        mock_submission.title = "Gallery Post"
        mock_submission.author.name = "gallery_poster"
        mock_submission.selftext = ""
        mock_submission.selftext_html = None
        mock_submission.url = "https://www.reddit.com/gallery/gallery_post"
        mock_submission.permalink = "/r/test/comments/gallery_post/"
        mock_submission.created_utc = 1704024000.0
        mock_submission.score = 200
        mock_submission.num_comments = 30
        mock_submission.is_self = False
        mock_submission.is_video = False
        mock_submission.is_gallery = True
        mock_submission.thumbnail = "https://i.redd.it/gallery_thumb.jpg"
        mock_submission.media = None
        mock_submission.media_metadata = {
            "img1": {"s": {"u": "https://i.redd.it/img1.jpg"}},
            "img2": {"s": {"u": "https://i.redd.it/img2.jpg"}},
        }
        mock_submission.gallery_data = {
            "items": [
                {"media_id": "img1"},
                {"media_id": "img2"},
            ]
        }

        result = RedditPostData.from_praw(mock_submission)

        assert result.is_gallery is True
        assert result.media_metadata is not None
        assert "img1" in result.media_metadata
        assert result.gallery_data is not None
        assert len(result.gallery_data["items"]) == 2

    def test_crosspost_conversion(self):
        """Test converting a crosspost with crosspost_parent_list."""
        mock_submission = MagicMock()
        mock_submission.id = "crosspost"
        mock_submission.title = "Crosspost Title"
        mock_submission.author.name = "crossposter"
        mock_submission.selftext = ""
        mock_submission.selftext_html = None
        mock_submission.url = "https://reddit.com/r/original/comments/orig/"
        mock_submission.permalink = "/r/test/comments/crosspost/"
        mock_submission.created_utc = 1704024000.0
        mock_submission.score = 100
        mock_submission.num_comments = 20
        mock_submission.is_self = False
        mock_submission.is_video = False
        mock_submission.thumbnail = "https://i.redd.it/crosspost_thumb.jpg"
        mock_submission.media = None
        mock_submission.crosspost_parent_list = [
            {
                "id": "original_post",
                "title": "Original Title",
                "author": "original_poster",
            }
        ]

        result = RedditPostData.from_praw(mock_submission)

        assert result.crosspost_parent_list is not None
        assert len(result.crosspost_parent_list) == 1
        assert result.crosspost_parent_list[0]["id"] == "original_post"

    def test_preview_images(self):
        """Test that preview images are preserved."""
        mock_submission = MagicMock()
        mock_submission.id = "preview_post"
        mock_submission.title = "Post with Preview"
        mock_submission.author.name = "user"
        mock_submission.selftext = ""
        mock_submission.selftext_html = None
        mock_submission.url = "https://example.com"
        mock_submission.permalink = "/r/test/comments/preview_post/"
        mock_submission.created_utc = 1704024000.0
        mock_submission.score = 50
        mock_submission.num_comments = 10
        mock_submission.is_self = False
        mock_submission.is_video = False
        mock_submission.thumbnail = "https://i.redd.it/thumb.jpg"
        mock_submission.media = None
        mock_submission.preview = {
            "images": [
                {
                    "source": {"url": "https://i.redd.it/full.jpg"},
                    "resolutions": [{"url": "https://i.redd.it/small.jpg"}],
                }
            ]
        }

        result = RedditPostData.from_praw(mock_submission)

        assert result.preview is not None
        assert "images" in result.preview

    def test_missing_optional_attributes(self):
        """Test handling when optional attributes don't exist on submission."""
        mock_submission = MagicMock(
            spec=[
                "id",
                "title",
                "author",
                "selftext",
                "selftext_html",
                "url",
                "permalink",
                "created_utc",
                "score",
                "num_comments",
                "is_self",
                "is_video",
                "thumbnail",
                "media",
            ]
        )
        mock_submission.id = "minimal_post"
        mock_submission.title = "Minimal Post"
        mock_submission.author.name = "user"
        mock_submission.selftext = ""
        mock_submission.selftext_html = None
        mock_submission.url = "https://example.com"
        mock_submission.permalink = "/r/test/"
        mock_submission.created_utc = 1704024000.0
        mock_submission.score = 1
        mock_submission.num_comments = 0
        mock_submission.is_self = False
        mock_submission.is_video = False
        mock_submission.thumbnail = ""
        mock_submission.media = None

        result = RedditPostData.from_praw(mock_submission)

        # These use getattr with defaults
        assert result.is_gallery is False
        assert result.preview is None
        assert result.media_metadata is None
        assert result.gallery_data is None
        assert result.crosspost_parent_list is None

    def test_to_dict_still_works(self):
        """Verify to_dict() method still works after from_praw() conversion."""
        mock_submission = MagicMock()
        mock_submission.id = "dict_test"
        mock_submission.title = "Dict Test"
        mock_submission.author.name = "user"
        mock_submission.selftext = "Content"
        mock_submission.selftext_html = "<p>Content</p>"
        mock_submission.url = "https://example.com"
        mock_submission.permalink = "/r/test/"
        mock_submission.created_utc = 1704024000.0
        mock_submission.score = 100
        mock_submission.num_comments = 10
        mock_submission.is_self = True
        mock_submission.is_video = False
        mock_submission.thumbnail = "self"
        mock_submission.media = None

        result = RedditPostData.from_praw(mock_submission)
        result_dict = result.to_dict()

        assert result_dict["id"] == "dict_test"
        assert result_dict["title"] == "Dict Test"
        assert result_dict["author"] == "user"


class TestRedditCommentFromPraw:
    """Test RedditComment.from_praw() conversion."""

    def test_basic_comment_conversion(self):
        """Test converting a basic PRAW comment with all fields."""
        mock_comment = MagicMock()
        mock_comment.id = "comment123"
        mock_comment.body = "This is a comment"
        mock_comment.body_html = "<p>This is a comment</p>"
        mock_comment.author.name = "commenter"
        mock_comment.score = 42
        mock_comment.permalink = "/r/test/comments/post/title/comment123/"
        mock_comment.created_utc = 1704025000.0

        result = RedditComment.from_praw(mock_comment)

        assert result.id == "comment123"
        assert result.body == "This is a comment"
        assert result.body_html == "<p>This is a comment</p>"
        assert result.author == "commenter"
        assert result.score == 42
        assert result.permalink == "/r/test/comments/post/title/comment123/"
        assert result.created_utc == 1704025000.0
        assert result.replies is None  # Replies handled separately

    def test_deleted_comment_author(self):
        """Test that deleted comments (author=None) are handled with '[deleted]'."""
        mock_comment = MagicMock()
        mock_comment.id = "deleted_comment"
        mock_comment.body = "[deleted]"
        mock_comment.body_html = None
        mock_comment.author = None  # Author deleted their account
        mock_comment.score = 0
        mock_comment.permalink = "/r/test/comments/post/title/deleted/"
        mock_comment.created_utc = 1704025000.0

        result = RedditComment.from_praw(mock_comment)

        assert result.author == "[deleted]"
        assert result.body == "[deleted]"

    def test_negative_score_comment(self):
        """Test that negative scores are preserved."""
        mock_comment = MagicMock()
        mock_comment.id = "downvoted"
        mock_comment.body = "Unpopular opinion"
        mock_comment.body_html = "<p>Unpopular opinion</p>"
        mock_comment.author.name = "controversial_user"
        mock_comment.score = -50
        mock_comment.permalink = "/r/test/comments/post/title/downvoted/"
        mock_comment.created_utc = 1704025000.0

        result = RedditComment.from_praw(mock_comment)

        assert result.score == -50

    def test_comment_with_markdown(self):
        """Test comment with markdown formatting."""
        mock_comment = MagicMock()
        mock_comment.id = "markdown_comment"
        mock_comment.body = "**bold** and *italic* and [link](https://example.com)"
        mock_comment.body_html = (
            "<p><strong>bold</strong> and <em>italic</em> and "
            '<a href="https://example.com">link</a></p>'
        )
        mock_comment.author.name = "formatter"
        mock_comment.score = 10
        mock_comment.permalink = "/r/test/comments/post/title/markdown/"
        mock_comment.created_utc = 1704025000.0

        result = RedditComment.from_praw(mock_comment)

        assert "**bold**" in result.body
        assert "<strong>bold</strong>" in result.body_html


class TestDictConstructorsStillWork:
    """Verify the original dict-based constructors still work."""

    def test_reddit_post_data_dict_constructor(self):
        """Test that RedditPostData dict constructor still works."""
        data = {
            "id": "test123",
            "title": "Test Title",
            "author": "test_author",
            "selftext": "Body text",
            "selftext_html": "<p>Body text</p>",
            "url": "https://example.com",
            "permalink": "/r/test/",
            "created_utc": 1704024000,
            "score": 100,
            "num_comments": 50,
            "is_self": True,
            "is_video": False,
            "thumbnail": "self",
        }

        result = RedditPostData(data)

        assert result.id == "test123"
        assert result.title == "Test Title"
        assert result.author == "test_author"
        assert result.score == 100

    def test_reddit_post_data_dict_with_defaults(self):
        """Test that missing keys get default values."""
        data = {"id": "minimal"}

        result = RedditPostData(data)

        assert result.id == "minimal"
        assert result.title == ""
        assert result.author == ""
        assert result.score == 0
        assert result.is_self is False
        assert result.is_gallery is False

    def test_reddit_comment_dict_constructor(self):
        """Test that RedditComment dict constructor still works."""
        data = {
            "id": "comment123",
            "body": "Comment text",
            "body_html": "<p>Comment text</p>",
            "author": "commenter",
            "score": 25,
            "permalink": "/r/test/comments/post/title/comment123/",
            "created_utc": 1704025000,
        }

        result = RedditComment(data)

        assert result.id == "comment123"
        assert result.body == "Comment text"
        assert result.author == "commenter"
        assert result.score == 25

    def test_reddit_comment_dict_with_defaults(self):
        """Test that missing keys get default values."""
        data = {"id": "minimal"}

        result = RedditComment(data)

        assert result.id == "minimal"
        assert result.body == ""
        assert result.author == ""
        assert result.score == 0
