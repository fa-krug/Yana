import logging
from typing import Any, Dict, List, Optional
from datetime import datetime
from django.utils import timezone

from ..base import BaseAggregator
from ..utils import format_article_content
from ..utils.youtube import create_youtube_embed_html
from ..utils.youtube_client import YouTubeClient, YouTubeAPIError

logger = logging.getLogger(__name__)

class YouTubeAggregator(BaseAggregator):
    """
    YouTube aggregator using YouTube Data API v3.
    """
    
    def __init__(self, feed):
        super().__init__(feed)
        self.channel_icon_url: Optional[str] = None
        self._client: Optional[YouTubeClient] = None
        self._channel_id: Optional[str] = None

    def get_aggregator_type(self) -> str:
        return "youtube"

    supports_identifier_search = True

    @classmethod
    def get_identifier_choices(
        cls, query: Optional[str] = None, user: Optional[Any] = None
    ) -> List[tuple]:
        """Search for YouTube channels via API."""
        if not query or not user or not user.is_authenticated:
            return []

        try:
            from core.models import UserSettings
            settings = UserSettings.objects.get(user=user)
            if not settings.youtube_enabled or not settings.youtube_api_key:
                return []

            client = YouTubeClient(settings.youtube_api_key)
            
            # Use search.list to find channels
            data = client._get("search", {
                "part": "snippet",
                "q": query,
                "type": "channel",
                "maxResults": 10
            })
            
            items = data.get("items", [])
            choices = []
            
            for item in items:
                channel_id = item.get("id", {}).get("channelId")
                snippet = item.get("snippet", {})
                title = snippet.get("title")
                custom_url = snippet.get("customUrl")
                
                if channel_id and title:
                    # Prefer custom URL (handle) if available, otherwise use channel ID
                    value = custom_url if custom_url else channel_id
                    label = f"{title} ({value})"
                    choices.append((value, label))
                    
            return choices
        except Exception as e:
            logger.error(f"Error searching YouTube channels: {e}")
            return []

    def get_source_url(self) -> str:
        """Return the YouTube channel URL."""
        if self.identifier:
            if self.identifier.startswith("UC"):
                return f"https://www.youtube.com/channel/{self.identifier}"
            if self.identifier.startswith("@"):
                return f"https://www.youtube.com/{self.identifier}"
        return "https://www.youtube.com"

    def _get_client(self) -> YouTubeClient:
        """Get or create the YouTube API client."""
        if self._client:
            return self._client
            
        if not self.feed or not self.feed.user:
            raise YouTubeAPIError("Feed must have a user to access YouTube API settings")
            
        from core.models import UserSettings
        try:
            settings = UserSettings.objects.get(user=self.feed.user)
            if not settings.youtube_enabled or not settings.youtube_api_key:
                raise YouTubeAPIError("YouTube API is not enabled or API key is missing in user settings")
            
            self._client = YouTubeClient(settings.youtube_api_key)
            return self._client
        except UserSettings.DoesNotExist:
            raise YouTubeAPIError("User settings not found")

    def validate(self) -> None:
        """Validate and resolve channel identifier."""
        super().validate()
        
        client = self._get_client()
        channel_id, error = client.resolve_channel_id(self.identifier)
        
        if error or not channel_id:
            raise YouTubeAPIError(f"Could not resolve YouTube identifier: {error}")
            
        self._channel_id = channel_id

    def fetch_source_data(self, limit: Optional[int] = None) -> Any:
        """Fetch videos from the channel."""
        if not self._channel_id:
            self.validate()
            
        client = self._get_client()
        
        # Fetch channel metadata (for icon and uploads playlist)
        channel_data = client.fetch_channel_data(self._channel_id)
        self.channel_icon_url = channel_data.get("channel_icon_url")
        
        uploads_playlist_id = channel_data.get("uploads_playlist_id")
        desired_count = limit or self.daily_limit
        
        if uploads_playlist_id:
            videos = client.fetch_videos_from_playlist(uploads_playlist_id, max_results=desired_count)
        else:
            # Fallback to search if uploads playlist is not available
            videos = client.fetch_videos_via_search(self._channel_id, max_results=desired_count)
            
        return {
            "videos": videos,
            "channel_id": self._channel_id,
            "channel_title": channel_data.get("title")
        }

    def parse_to_raw_articles(self, source_data: Any) -> List[Dict[str, Any]]:
        """Parse YouTube videos to article dictionaries."""
        videos = source_data.get("videos", [])
        articles = []
        
        for video in videos:
            snippet = video.get("snippet", {})
            video_id = video.get("id")
            if isinstance(video_id, dict):
                video_id = video_id.get("videoId")
                
            published_at = snippet.get("publishedAt")
            if published_at:
                date = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
            else:
                date = timezone.now()
                
            # Use high quality thumbnail if available
            thumbnails = snippet.get("thumbnails", {})
            icon_url = (
                thumbnails.get("maxres", {}).get("url") or
                thumbnails.get("high", {}).get("url") or
                thumbnails.get("medium", {}).get("url")
            )
            
            article = {
                "name": snippet.get("title", ""),
                "identifier": f"https://www.youtube.com/watch?v={video_id}",
                "raw_content": snippet.get("description", ""),
                "content": snippet.get("description", ""),
                "date": date,
                "author": source_data.get("channel_title", ""),
                "icon": icon_url,
                "_youtube_video_id": video_id,
            }
            articles.append(article)
            
        return articles

    def enrich_articles(self, articles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Enrich articles with comments and build full HTML content."""
        client = self._get_client()
        
        # TODO: Make comment limit configurable
        comment_limit = 10
        
        for article in articles:
            video_id = article.get("_youtube_video_id")
            description = article.get("content", "")
            
            # Fetch comments
            comments = client.fetch_video_comments(video_id, max_results=comment_limit)
            
            # Build content HTML
            content_html = self._build_content_html(description, comments)
            article["content"] = content_html
            article["raw_content"] = content_html # YouTube articles don't have separate raw content from website
            
        return articles

    def _build_content_html(self, description: str, comments: List[Dict[str, Any]]) -> str:
        """Build the final HTML content for the article."""
        # Convert description newlines to <br>
        formatted_description = description.replace("\n", "<br>")
        
        html = f'<div class="youtube-description">{formatted_description}</div>'
        
        if comments:
            html += '<div class="youtube-comments"><h3>Comments</h3>'
            for comment in comments:
                snippet = comment.get("snippet", {}).get("topLevelComment", {}).get("snippet", {})
                author = snippet.get("authorDisplayName", "Unknown")
                text = snippet.get("textDisplay", "")
                
                html += f'<div class="youtube-comment" style="margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">'
                html += f'<strong>{author}</strong><br>'
                html += f'<div>{text}</div>'
                html += '</div>'
            html += '</div>'
            
        return html

    def finalize_articles(self, articles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Finalize articles by adding the YouTube embed in the header."""
        finalized = []
        
        for article in articles:
            video_id = article.get("_youtube_video_id")
            
            # Create YouTube embed
            embed_html = create_youtube_embed_html(video_id)
            
            # Use format_article_content for standard Yana styling
            processed = format_article_content(
                content=article["content"],
                title=article["name"],
                url=article["identifier"],
                author=article.get("author"),
                date=article.get("date"),
                header_image_url=None, # We use the embed instead
            )
            
            # Prepend the embed to the formatted content
            article["content"] = embed_html + processed
            
            # Clean up internal fields
            article.pop("_youtube_video_id", None)
            finalized.append(article)
            
        return finalized

    def aggregate(self) -> List[Dict[str, Any]]:
        """Implementation of the aggregation flow."""
        try:
            self.validate()
            source_data = self.fetch_source_data(self.daily_limit)
            articles = self.parse_to_raw_articles(source_data)
            articles = self.filter_articles(articles)
            articles = self.enrich_articles(articles)
            articles = self.finalize_articles(articles)
            return articles
        except Exception as e:
            self.logger.error(f"Aggregation failed for {self.identifier}: {str(e)}")
            raise
