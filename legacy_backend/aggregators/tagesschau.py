"""Aggregator for Tagesschau RSS feeds."""

import copy
import html
import json

from bs4 import BeautifulSoup
from pydantic import BaseModel, Field

from .base import BaseAggregator, RawArticle


class TagesschauAggregatorConfig(BaseModel):
    id: str
    type: str = Field(pattern="^(managed|custom|social)$")
    name: str = Field(min_length=1)
    url: str = ""
    description: str = Field(min_length=1)
    wait_for_selector: str | None = None
    selectors_to_remove: list[str] = Field(default_factory=list)
    options: dict = Field(default_factory=dict)


class TagesschauAggregator(BaseAggregator):
    """Aggregator for Tagesschau.de (German news)."""

    id = "tagesschau"
    type = "managed"
    name = "Tagesschau"
    url = "https://www.tagesschau.de/xml/rss2/"
    description = "Specialized aggregator for Tagesschau.de (German news). Extracts article content using textabsatz paragraphs, embeds video/audio headers when present, and filters out video news and podcasts."
    wait_for_selector = "p.textabsatz"
    selectors_to_remove = [
        "div.teaser",
        "div.socialbuttons",
        "aside",
        "nav",
        "button",
        "div.bigfive",
        "div.metatextline",
        "script",
        "style",
        "iframe",
        "noscript",
        "svg",
    ]

    def __init__(self):
        super().__init__()
        TagesschauAggregatorConfig(
            id=self.id,
            type=self.type,
            name=self.name,
            url=self.url,
            description=self.description,
            wait_for_selector=self.wait_for_selector,
            selectors_to_remove=self.selectors_to_remove,
            options=self.options,
        )

    def should_skip_article(self, article: RawArticle) -> tuple[bool, str | None]:
        """Skip video news and podcasts."""
        # Check title filters
        skip_terms = [
            "tagesschau",
            "tagesthemen",
            "11KM-Podcast",
            "Podcast 15 Minuten",
        ]
        if any(term in article.title for term in skip_terms):
            return True, f"Skipping filtered content: {article.title}"

        # Check URL filters
        if "bilder/blickpunkte" in article.url:
            return True, f"Skipping image gallery: {article.title}"

        # Use base skip logic for age/existence checks
        return super().should_skip_article(article)

    def _extract_media_header(self, soup: BeautifulSoup) -> str | None:
        """
        Extract video or audio header embed code from Tagesschau article page.

        Tagesschau uses a custom player system with:
        - div.v-instance with data-v-type="MediaPlayer"
        - data-v attribute containing JSON with media information
        - embedCode in pluginData.sharing@web.embedCode

        Returns:
            HTML string with media embed iframe (and image if available), or None if no media found
        """
        # Look for Tagesschau media player instances
        # They use: <div class="v-instance" data-v-type="MediaPlayer" data-v="{...}">
        # Look for players in the header/teaser area first (teaser-top class)
        media_players = soup.find_all(
            "div",
            attrs={"data-v-type": "MediaPlayer"},
            class_=lambda x: x and "mediaplayer" in str(x).lower(),
        )

        # Prefer teaser-top players (header media) over other players
        teaser_players = [
            p
            for p in media_players
            if p.get("class")
            and any("teaser-top" in str(c) for c in p.get("class", []))
        ]
        players_to_check = teaser_players if teaser_players else media_players

        for player_div in players_to_check:
            data_v = player_div.get("data-v")
            if not data_v:
                continue

            try:
                # Parse the JSON data (it's HTML-encoded)
                data_v_decoded = html.unescape(data_v)
                player_data = json.loads(data_v_decoded)

                # Check if it's video or audio
                mc = player_data.get("mc", {})
                streams = mc.get("streams", [])

                # Determine if it's audio-only or video
                is_audio_only = all(
                    stream.get("isAudioOnly", False) for stream in streams
                )

                # Extract image/poster from player data
                image_url = None
                # Check common image fields in mc
                for image_field in ["poster", "image", "thumbnail", "preview", "cover"]:
                    if image_field in mc and mc[image_field]:
                        image_url = mc[image_field]
                        break

                # If not found in mc, check streams
                if not image_url:
                    for stream in streams:
                        for image_field in [
                            "poster",
                            "image",
                            "thumbnail",
                            "preview",
                            "cover",
                        ]:
                            if image_field in stream and stream[image_field]:
                                image_url = stream[image_field]
                                break
                        if image_url:
                            break

                # If still not found, check for image elements near the player
                if not image_url:
                    # Look for img tags in parent or sibling elements
                    parent = player_div.find_parent()
                    if parent:
                        # Check for images in the same container
                        img = parent.find("img")
                        if img and img.get("src"):
                            image_url = img.get("src")
                        # Also check for images in previous/next siblings
                        if not image_url:
                            prev_sibling = player_div.find_previous_sibling()
                            if prev_sibling:
                                img = prev_sibling.find("img")
                                if img and img.get("src"):
                                    image_url = img.get("src")

                # Make image URL absolute if found
                if image_url:
                    if image_url.startswith("//"):
                        image_url = "https:" + image_url
                    elif image_url.startswith("/"):
                        image_url = "https://www.tagesschau.de" + image_url
                    self.logger.debug(f"Found player image: {image_url}")

                # Try to extract embed code from pluginData
                plugin_data = player_data.get("pluginData", {})
                sharing_data = plugin_data.get("sharing@web", {})
                embed_code = sharing_data.get("embedCode", "")

                if embed_code:
                    # The embed code is HTML-encoded, decode it
                    embed_code_decoded = html.unescape(embed_code)
                    # Extract iframe src from embed code
                    embed_soup = BeautifulSoup(embed_code_decoded, "html.parser")
                    iframe = embed_soup.find("iframe")
                    if iframe and iframe.get("src"):
                        src = iframe.get("src")
                        # Remove $params$ placeholder if present
                        src = src.replace("$params$", "")
                        # Make sure URL is absolute
                        if src.startswith("//"):
                            src = "https:" + src
                        elif src.startswith("/"):
                            src = "https://www.tagesschau.de" + src
                        # Adjust height for audio (smaller) vs video
                        height = "200" if is_audio_only else "315"
                        # Build media header with iframe
                        # For audio with image: use image as background
                        if is_audio_only and image_url:
                            media_html = (
                                '<div class="media-header" style="position: relative; background-image: url(\''
                                + image_url
                                + "'); background-size: cover; background-position: center; padding: 20px; border-radius: 8px;\">"
                                f'<iframe src="{src}" width="100%" height="{height}" '
                                'frameborder="0" allowfullscreen scrolling="no" style="background: rgba(0,0,0,0.7); border-radius: 4px;"></iframe>'
                                "</div>"
                            )
                        else:
                            # For video, just embed the iframe (it may have its own poster)
                            media_html = (
                                '<div class="media-header">'
                                f'<iframe src="{src}" width="100%" height="{height}" '
                                'frameborder="0" allowfullscreen scrolling="no"></iframe>'
                                "</div>"
                            )
                        return media_html

                # Fallback: construct player from media URL if available
                for stream in streams:
                    media_items = stream.get("media", [])
                    for media_item in media_items:
                        url = media_item.get("url")
                        mime_type = media_item.get("mimeType", "")
                        if not url:
                            continue

                        # Build media header with player (image merged as poster/background)
                        if is_audio_only and "audio" in mime_type.lower():
                            # Create HTML5 audio player with image as background
                            if image_url:
                                media_html = (
                                    '<div class="media-header" style="position: relative; background-image: url(\''
                                    + image_url
                                    + "'); background-size: cover; background-position: center; padding: 20px; border-radius: 8px;\">"
                                    f'<audio controls style="width: 100%; background: rgba(0,0,0,0.7); border-radius: 4px;">'
                                    f'<source src="{url}" type="{mime_type}">'
                                    "Your browser does not support the audio element."
                                    "</audio>"
                                    "</div>"
                                )
                            else:
                                media_html = (
                                    '<div class="media-header">'
                                    f'<audio controls style="width: 100%;">'
                                    f'<source src="{url}" type="{mime_type}">'
                                    "Your browser does not support the audio element."
                                    "</audio>"
                                    "</div>"
                                )
                        elif not is_audio_only and "video" in mime_type.lower():
                            # Create HTML5 video player with poster image
                            poster_attr = f'poster="{image_url}"' if image_url else ""
                            media_html = (
                                '<div class="media-header">'
                                f'<video controls {poster_attr} style="max-width: 100%; height: auto; width: 100%;">'
                                f'<source src="{url}" type="{mime_type}">'
                                "Your browser does not support the video element."
                                "</video>"
                                "</div>"
                            )
                        else:
                            return None

                        return media_html

            except (json.JSONDecodeError, KeyError, AttributeError) as e:
                self.logger.debug(f"Failed to parse Tagesschau media player data: {e}")
                continue

        return None

    def get_header_image_url(self, article: RawArticle) -> str | None:
        """
        Extract media header (video/audio) from Tagesschau article page.

        This method detects Tagesschau media players and stores the embed HTML
        in a custom attribute for use in standardize_format.

        Returns:
            None (media is handled separately in standardize_format)
        """
        try:
            soup = BeautifulSoup(article.html, "html.parser")
            media_header = self._extract_media_header(soup)

            if media_header:
                # Store media header HTML in article object for use in standardize_format
                # We use a custom attribute that won't conflict with Pydantic
                if not hasattr(article, "_media_header_html"):
                    article._media_header_html = media_header
                else:
                    article._media_header_html = media_header
                self.logger.info(
                    f"Found media header (video/audio) for article: {article.title}"
                )
                # Return None to skip image extraction (media takes priority)
                return None
        except Exception as e:
            self.logger.debug(f"Error extracting media header: {e}")

        # Return None to use default image detection
        return None

    def standardize_format(
        self, article: RawArticle, header_image_url: str | None = None
    ) -> None:
        """
        Standardize content format, adding media header (video/audio) if found.

        Overrides base method to prepend Tagesschau media headers before
        the standard header image processing.
        """
        # Check if we have a media header stored from get_header_image_url
        media_header_html = getattr(article, "_media_header_html", None)

        if media_header_html:
            # Prepend media header to content
            article.html = media_header_html + article.html
            self.logger.debug("Prepended media header to article content")
            # Custom handling: use standardize_content_format directly to skip image extraction
            from aggregators.base.process import standardize_content_format

            article.html = standardize_content_format(
                article.html,
                article,
                generate_title_image=False,  # Skip image extraction when media header exists
                add_source_footer=self.feed.add_source_footer if self.feed else True,
                header_image_url=None,
            )
        else:
            # Normal flow: call parent method
            super().standardize_format(article, header_image_url=header_image_url)

    def extract_content(self, article: RawArticle) -> None:
        """Extract content from textabsatz paragraphs."""
        try:
            soup = BeautifulSoup(article.html, "html.parser")
            content = soup.new_tag("div", **{"class": "article-content"})

            # Extract text content
            for element in soup.find_all(["p", "h2"]):
                if element.find_parent(
                    ["div"],
                    class_=lambda x: x
                    and any(
                        skip in x
                        for skip in ["teaser", "bigfive", "accordion", "related"]
                    )
                    if isinstance(x, list)
                    else (
                        x
                        and any(
                            skip in x
                            for skip in ["teaser", "bigfive", "accordion", "related"]
                        )
                    ),
                ):
                    continue
                if element.name == "p" and element.get("class"):
                    classes = element.get("class", [])
                    if any("textabsatz" in c for c in classes):
                        new_p = copy.copy(element)
                        new_p.attrs = {}
                        content.append(new_p)
                elif element.name == "h2":
                    classes = element.get("class", [])
                    if any("trenner" in c for c in classes):
                        new_h2 = soup.new_tag("h2")
                        new_h2.string = element.get_text(strip=True)
                        content.append(new_h2)
            article.html = str(content)
        except Exception as e:
            self.logger.error(
                f"Extraction failed for {article.url}: {e}", exc_info=True
            )


def aggregate(feed, force_refresh=False, options=None):
    aggregator = TagesschauAggregator()
    return aggregator.aggregate(feed, force_refresh, options or {})
