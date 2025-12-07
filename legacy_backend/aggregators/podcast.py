"""
Podcast RSS aggregator.

This module provides an aggregator for podcast RSS feeds (iTunes/RSS 2.0).

Features:
- Detects iTunes podcast namespace
- Extracts audio enclosure URL
- Parses duration from iTunes tags
- Creates embedded audio player content
"""

import logging
from typing import Any

from pydantic import BaseModel, Field

from .base import BaseAggregator, RawArticle

logger = logging.getLogger(__name__)


class PodcastAggregatorConfig(BaseModel):
    id: str
    type: str = Field(pattern="^(managed|custom|social)$")
    name: str = Field(min_length=1)
    url: str = ""
    description: str = Field(min_length=1)
    wait_for_selector: str | None = None
    selectors_to_remove: list[str] = Field(default_factory=list)
    options: dict = Field(default_factory=dict)


def parse_duration_to_seconds(duration_str: str) -> int | None:
    """
    Parse podcast duration string to seconds.

    Supports formats:
    - HH:MM:SS (01:23:45)
    - MM:SS (23:45)
    - Seconds only (1234)
    """
    if not duration_str:
        return None

    duration_str = duration_str.strip()

    # Try seconds only
    if duration_str.isdigit():
        return int(duration_str)

    # Try HH:MM:SS or MM:SS format
    parts = duration_str.split(":")
    try:
        if len(parts) == 3:
            hours, minutes, seconds = map(int, parts)
            return hours * 3600 + minutes * 60 + seconds
        elif len(parts) == 2:
            minutes, seconds = map(int, parts)
            return minutes * 60 + seconds
    except (ValueError, TypeError):
        pass

    return None


class PodcastAggregator(BaseAggregator):
    """
    Aggregator for podcast RSS feeds (iTunes/RSS 2.0).

    Podcast RSS feeds typically include:
    - <enclosure> with audio file URL and MIME type
    - <itunes:duration> for episode length
    - <itunes:image> for episode/show artwork
    - <itunes:summary> or <description> for episode notes
    """

    id = "podcast"
    type = "custom"
    name = "Podcast"
    url = ""
    description = (
        "Aggregator for podcast RSS feeds (iTunes/RSS 2.0). "
        "Extracts audio files, duration, and show notes. "
        "Creates embedded HTML5 audio players for each episode."
    )
    selectors_to_remove = []

    def __init__(self):
        super().__init__()
        PodcastAggregatorConfig(
            id=self.id,
            type=self.type,
            name=self.name,
            url=self.url,
            description=self.description,
            wait_for_selector=self.wait_for_selector,
            selectors_to_remove=self.selectors_to_remove,
            options=self.options,
        )

    def parse_entry(self, entry: Any) -> RawArticle:
        """
        Parse podcast RSS entry with audio metadata.

        Podcast entries include:
        - enclosure: Audio file URL and type
        - itunes:duration: Episode length
        - itunes:image: Episode artwork
        """
        article = super().parse_entry(entry)

        # Extract and store podcast-specific data
        audio_url, audio_type = self._extract_enclosure(entry)
        entry["_podcast_audio_url"] = audio_url
        entry["_podcast_audio_type"] = audio_type
        entry["_podcast_duration"] = self._extract_duration(entry)
        entry["_podcast_image"] = self._extract_image(entry)

        return article

    def _extract_enclosure(self, entry: Any) -> tuple[str, str]:
        """Extract audio enclosure URL and MIME type."""
        enclosures = entry.get("enclosures", [])

        for enclosure in enclosures:
            url = enclosure.get("url", "") or enclosure.get("href", "")
            media_type = enclosure.get("type", "")

            # Look for audio types
            if media_type.startswith("audio/") or url.lower().endswith(
                (".mp3", ".m4a", ".wav", ".ogg", ".opus", ".aac")
            ):
                return url, media_type

        # Try links with enclosure rel
        for link in entry.get("links", []):
            if link.get("rel") == "enclosure":
                url = link.get("href", "")
                media_type = link.get("type", "")
                if url:
                    return url, media_type

        return "", ""

    def _extract_duration(self, entry: Any) -> int | None:
        """Extract episode duration in seconds."""
        # Try itunes:duration
        duration_str = entry.get("itunes_duration", "")
        if duration_str:
            return parse_duration_to_seconds(duration_str)

        # Try duration
        duration_str = entry.get("duration", "")
        if duration_str:
            return parse_duration_to_seconds(duration_str)

        return None

    def _extract_image(self, entry: Any) -> str:
        """Extract episode or show artwork URL."""
        # Try itunes:image (episode-specific)
        itunes_image = entry.get("itunes_image", {})
        if isinstance(itunes_image, dict):
            url = itunes_image.get("href", "")
            if url:
                return url

        # Try image (RSS standard)
        image = entry.get("image", {})
        if isinstance(image, dict):
            url = image.get("href", "") or image.get("url", "")
            if url:
                return url

        # Try media:thumbnail
        media_thumbnail = entry.get("media_thumbnail", [])
        if media_thumbnail and isinstance(media_thumbnail, list):
            return media_thumbnail[0].get("url", "")

        return ""

    def fetch_article_html(self, article: RawArticle) -> str:
        """
        Generate HTML content with embedded audio player.

        Creates:
        - Episode artwork (if available)
        - HTML5 audio player with controls
        - Download link
        - Episode description/show notes
        """
        entry = article.entry
        audio_url = entry.get("_podcast_audio_url", "")
        audio_type = entry.get("_podcast_audio_type", "audio/mpeg")
        duration = entry.get("_podcast_duration")
        image_url = entry.get("_podcast_image", "")

        # Extract description
        description = self._extract_description(entry)

        html_parts = []

        # Episode artwork
        if image_url:
            html_parts.append(
                f'<div class="podcast-artwork">'
                f'<img src="{image_url}" alt="Episode artwork" loading="lazy">'
                f"</div>"
            )

        # Audio player
        if audio_url:
            html_parts.append(
                f'<div class="podcast-player">'
                f'<audio controls preload="metadata">'
                f'<source src="{audio_url}" type="{audio_type or "audio/mpeg"}">'
                f"Your browser does not support the audio element."
                f"</audio>"
            )

            # Duration badge
            if duration:
                formatted_duration = self._format_duration(duration)
                html_parts.append(
                    f'<span class="podcast-duration">{formatted_duration}</span>'
                )

            # Download link
            html_parts.append(
                f'<a href="{audio_url}" class="podcast-download" download>'
                f'<i class="bi bi-download"></i> Download Episode'
                f"</a>"
                f"</div>"
            )

        # Episode description/show notes
        if description:
            html_parts.append('<div class="podcast-description">')
            html_parts.append("<h4>Show Notes</h4>")
            # Parse HTML or convert plain text
            if "<" in description and ">" in description:
                # Already HTML
                html_parts.append(description)
            else:
                # Plain text - convert to paragraphs
                paragraphs = description.split("\n\n")
                for para in paragraphs:
                    para = para.strip()
                    if para:
                        para = para.replace("\n", "<br>")
                        html_parts.append(f"<p>{para}</p>")
            html_parts.append("</div>")

        return "\n".join(html_parts)

    def _extract_description(self, entry: Any) -> str:
        """Extract episode description/show notes."""
        # Try content:encoded (full HTML)
        for content in entry.get("content", []):
            if content.get("type") == "text/html":
                return content.get("value", "")

        # Try itunes:summary
        summary = entry.get("itunes_summary", "")
        if summary:
            return summary

        # Try description
        summary = entry.get("summary", "") or entry.get("description", "")
        return summary

    def _format_duration(self, seconds: int) -> str:
        """Format duration in seconds to HH:MM:SS or MM:SS."""
        hours, remainder = divmod(seconds, 3600)
        minutes, secs = divmod(remainder, 60)
        if hours:
            return f"{hours}:{minutes:02d}:{secs:02d}"
        return f"{minutes}:{secs:02d}"

    def extract_content(self, article: RawArticle) -> None:
        """Content is already extracted in fetch_article_html."""
        pass

    def save_article(self, article: RawArticle, content: str) -> bool:
        """
        Save article with podcast-specific metadata.

        Stores:
        - thumbnail_url: Episode artwork
        - media_url: Audio file URL
        - duration: Episode length in seconds
        - media_type: Audio MIME type
        """
        from django.utils import timezone

        from core.models import Article

        entry = article.entry
        audio_url = entry.get("_podcast_audio_url", "")
        audio_type = entry.get("_podcast_audio_type", "")
        duration = entry.get("_podcast_duration")
        image_url = entry.get("_podcast_image", "")

        # Use current timestamp if feed is configured for it (default: True)
        if self.feed and getattr(self.feed, "use_current_timestamp", True):
            article_date = timezone.now()
        else:
            article_date = article.date

        _, created = Article.objects.update_or_create(
            url=article.url,
            defaults={
                "feed": self.feed,
                "name": article.title,
                "date": article_date,
                "content": content,
                "thumbnail_url": image_url,
                "media_url": audio_url,
                "duration": duration,
                "media_type": audio_type or "audio/mpeg",
            },
        )

        if created:
            self.logger.info(f"Created podcast episode: {article.title}")

        return created


# Module-level wrapper for compatibility
def aggregate(feed, force_refresh=False, options=None):
    """Module-level wrapper for admin interface."""
    aggregator = PodcastAggregator()
    return aggregator.aggregate(feed, force_refresh, options or {})
