"""Reddit type definitions."""

from typing import Any, Dict


class RedditPostData:
    """Reddit post data structure from API."""

    def __init__(self, data: Dict[str, Any]):
        self.id = data.get("id", "")
        self.title = data.get("title", "")
        self.selftext = data.get("selftext", "")
        self.selftext_html = data.get("selftext_html")
        self.url = data.get("url", "")
        self.permalink = data.get("permalink", "")
        self.created_utc = data.get("created_utc", 0)
        self.author = data.get("author", "")
        self.score = data.get("score", 0)
        self.num_comments = data.get("num_comments", 0)
        self.thumbnail = data.get("thumbnail", "")
        self.preview = data.get("preview")
        self.media_metadata = data.get("media_metadata")
        self.gallery_data = data.get("gallery_data")
        self.is_gallery = data.get("is_gallery", False)
        self.is_self = data.get("is_self", False)
        self.is_video = data.get("is_video", False)
        self.media = data.get("media")
        self.crosspost_parent_list = data.get("crosspost_parent_list")

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "title": self.title,
            "selftext": self.selftext,
            "selftext_html": self.selftext_html,
            "url": self.url,
            "permalink": self.permalink,
            "created_utc": self.created_utc,
            "author": self.author,
            "score": self.score,
            "num_comments": self.num_comments,
            "thumbnail": self.thumbnail,
            "preview": self.preview,
            "media_metadata": self.media_metadata,
            "gallery_data": self.gallery_data,
            "is_gallery": self.is_gallery,
            "is_self": self.is_self,
            "is_video": self.is_video,
            "media": self.media,
            "crosspost_parent_list": self.crosspost_parent_list,
        }


class RedditPost:
    """Reddit API response wrapper for posts."""

    def __init__(self, data: Dict[str, Any]):
        self.data = RedditPostData(data.get("data", {}))


class RedditComment:
    """Reddit comment structure."""

    def __init__(self, data: Dict[str, Any]):
        self.id = data.get("id", "")
        self.body = data.get("body", "")
        self.body_html = data.get("body_html")
        self.author = data.get("author", "")
        self.score = data.get("score", 0)
        self.permalink = data.get("permalink", "")
        self.created_utc = data.get("created_utc", 0)
        self.replies = data.get("replies")
