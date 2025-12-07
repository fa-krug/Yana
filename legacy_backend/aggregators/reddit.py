"""
Reddit aggregator for fetching posts and comments from subreddits.

This module provides a Reddit aggregator that fetches posts from subreddits
using PRAW (Python Reddit API Wrapper) and integrates with the Feed/Article system.

Usage:
    Aggregator: reddit
    Identifier: subreddit name (e.g., "python", "programming")
    Feed Type: reddit
    Aggregator Options (JSON):
        {
            "sort_by": "hot",      # hot, new, top, rising
            "comment_limit": 10    # Number of top comments to fetch
        }
"""

import html
import logging
import re
from datetime import datetime
from typing import Any

import markdown
import praw
from django.conf import settings
from django.utils import timezone
from praw.models import MoreComments
from pydantic import BaseModel, Field

try:
    import prawcore
except ImportError:
    prawcore = None  # type: ignore

from core.models import Article

from .base import BaseAggregator, RawArticle, is_content_too_old

logger = logging.getLogger(__name__)


def extract_subreddit_from_url(url: str) -> str | None:
    """
    Extract subreddit name from a Reddit URL.

    Args:
        url: Reddit URL (e.g., https://www.reddit.com/r/python)

    Returns:
        Subreddit name (e.g., 'python') or None if not found
    """
    # Pattern matches: /r/subreddit or r/subreddit
    match = re.search(r"(?:reddit\.com)?/r/([a-zA-Z0-9_]+)", url)
    if match:
        return match.group(1)
    return None


def normalize_subreddit(identifier: str) -> str:
    """
    Normalize a subreddit identifier.

    Handles various formats:
    - "python" -> "python"
    - "r/python" -> "python"
    - "/r/python" -> "python"
    - "https://reddit.com/r/python" -> "python"

    Args:
        identifier: Subreddit identifier in various formats

    Returns:
        Normalized subreddit name
    """
    identifier = identifier.strip()

    # Try to extract from URL first
    subreddit = extract_subreddit_from_url(identifier)
    if subreddit:
        return subreddit

    # Remove r/ or /r/ prefix
    if identifier.startswith("/r/"):
        return identifier[3:]
    if identifier.startswith("r/"):
        return identifier[2:]

    return identifier


def validate_subreddit(identifier: str) -> tuple[bool, str | None]:
    """
    Validate a subreddit identifier.

    Args:
        identifier: Subreddit identifier

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not identifier:
        return False, "Subreddit is required"

    subreddit = normalize_subreddit(identifier)

    # Subreddit names: 3-21 characters, alphanumeric and underscores only
    if not re.match(r"^[a-zA-Z0-9_]{2,21}$", subreddit):
        return (
            False,
            "Invalid subreddit name. Use 2-21 alphanumeric characters or underscores.",
        )

    return True, None


class RedditAggregatorConfig(BaseModel):
    id: str
    type: str = Field(pattern="^(managed|custom|social)$")
    name: str = Field(min_length=1)
    url: str = ""
    description: str = Field(min_length=1)
    wait_for_selector: str | None = None
    selectors_to_remove: list[str] = Field(default_factory=list)
    options: dict = Field(default_factory=dict)


class RedditAggregator(BaseAggregator):
    """
    Aggregator for Reddit subreddits.

    This aggregator fetches posts from Reddit using PRAW and converts them
    into HTML content with top comments. It extends BaseAggregator to leverage
    common aggregation infrastructure while implementing Reddit-specific logic.

    Options:
        sort_by: How to sort posts (hot, new, top, rising). Default: "hot"
        comment_limit: Number of top comments to fetch. Default: 10
    """

    id = "reddit"
    type = "social"
    name = "Reddit"
    url = ""
    description = (
        "Fetch posts and top comments from Reddit subreddits. "
        "Configure sort method (hot/new/top/rising) and comment limit in options."
    )
    identifier_type = "string"
    identifier_label = "Subreddit"
    identifier_description = (
        "Enter the subreddit name (e.g., 'python', 'programming'). "
        "You can also use 'r/python' or a full Reddit URL."
    )
    identifier_placeholder = "python"
    identifier_editable = True
    options = {
        "sort_by": {
            "type": "choice",
            "label": "Sort Method",
            "help_text": "How to sort posts: hot (default), new, top, or rising",
            "default": "hot",
            "required": False,
            "choices": [
                ("hot", "Hot"),
                ("new", "New"),
                ("top", "Top"),
                ("rising", "Rising"),
            ],
        },
        "comment_limit": {
            "type": "integer",
            "label": "Comment Limit",
            "help_text": "Number of top comments to fetch per post",
            "default": 10,
            "required": False,
            "min": 0,
            "max": 50,
        },
    }

    def validate_identifier(self, identifier: str) -> tuple[bool, str | None]:
        """Validate a subreddit identifier."""
        return validate_subreddit(identifier)

    def normalize_identifier(self, identifier: str) -> str:
        """Normalize a subreddit identifier."""
        return normalize_subreddit(identifier)

    def check_subreddit_exists(self, subreddit_name: str) -> tuple[bool, str | None]:
        """
        Check if a subreddit exists and is accessible via Reddit API.

        Args:
            subreddit_name: Normalized subreddit name (e.g., "python")

        Returns:
            Tuple of (exists, error_message). If exists is True, error_message is None.
            If exists is False, error_message contains the reason.
        """
        if prawcore is None:
            # If prawcore is not available, skip validation
            # This can happen if praw dependencies aren't fully installed
            logger.warning("prawcore not available, skipping subreddit existence check")
            return True, None

        try:
            # Try to access subreddit properties to verify it exists
            # This will raise an exception if the subreddit doesn't exist or is inaccessible
            reddit = self.get_reddit_client()
            _ = reddit.subreddit(subreddit_name).id  # noqa: B018
            return True, None

        except prawcore.exceptions.NotFound:
            return False, f"Subreddit 'r/{subreddit_name}' does not exist."
        except prawcore.exceptions.Forbidden:
            return False, f"Subreddit 'r/{subreddit_name}' is private or banned."
        except prawcore.exceptions.Redirect:
            # Some subreddits redirect (e.g., old names)
            return False, f"Subreddit 'r/{subreddit_name}' is not accessible."
        except ValueError as e:
            # Raised when Reddit API credentials are not configured
            logger.warning(f"Could not check subreddit existence: {e}")
            # Don't fail validation if credentials aren't configured - let it pass
            # The error will be caught during actual aggregation
            return True, None
        except Exception as e:
            logger.warning(f"Error checking subreddit existence: {e}")
            # On other errors, don't block validation - let it pass
            # The error will be caught during actual aggregation
            return True, None

    def __init__(self):
        """Initialize the Reddit aggregator."""
        super().__init__()
        RedditAggregatorConfig(
            id=self.id,
            type=self.type,
            name=self.name,
            url=self.url,
            description=self.description,
            wait_for_selector=self.wait_for_selector,
            selectors_to_remove=self.selectors_to_remove,
            options=self.options,
        )
        self._reddit_client: praw.Reddit | None = None
        self._md = markdown.Markdown(
            extensions=[
                "nl2br",  # Convert newlines to <br>
                "fenced_code",  # Support ```code blocks```
                "tables",  # Support tables
                "sane_lists",  # Better list handling
            ]
        )

    # ============================================================================
    # Configuration helpers
    # ============================================================================

    def _get_subreddit_name(self) -> str:
        """Get subreddit name from feed's identifier field."""
        if not self.feed:
            return ""
        # The identifier field stores the subreddit name directly
        return normalize_subreddit(self.feed.identifier)

    def _extract_thumbnail_url(self, submission: Any) -> str | None:
        """
        Extract thumbnail URL from a Reddit submission.

        Args:
            submission: PRAW Submission object

        Returns:
            Thumbnail URL or None if not available
        """
        try:
            # Check if submission has a valid thumbnail URL
            thumbnail = getattr(submission, "thumbnail", None)
            if thumbnail and thumbnail not in ("self", "default", "nsfw", "spoiler"):
                # If it's a full URL, return it
                if thumbnail.startswith("http"):
                    return thumbnail
                # If it's a relative path, construct full URL
                if thumbnail.startswith("/"):
                    return f"https://reddit.com{thumbnail}"

            # Try to get from preview data
            if hasattr(submission, "preview") and submission.preview:
                preview = submission.preview
                if "images" in preview and preview["images"]:
                    source = preview["images"][0].get("source")
                    if source and "url" in source:
                        return html.unescape(source["url"])

            # For image posts, use the URL directly if it's an image
            if hasattr(submission, "url") and submission.url:
                url = submission.url
                if any(
                    url.lower().endswith(ext)
                    for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]
                ):
                    return url

            # For video posts, try to get preview
            if "v.redd.it" in getattr(submission, "url", ""):
                preview_url = self._extract_reddit_video_preview(submission)
                if preview_url:
                    return preview_url

            return None

        except (AttributeError, KeyError, IndexError) as e:
            self.logger.debug(f"Could not extract thumbnail URL: {e}")
            return None

    def _get_header_image_url(self, submission: Any) -> str | None:
        """
        Extract high-quality header image URL from a Reddit submission.

        This method prioritizes high-quality images suitable for use as header images,
        preferring preview source images over thumbnails.

        Args:
            submission: PRAW Submission object

        Returns:
            High-quality image URL or None if not available
        """
        try:
            # Priority 1: Preview source images (highest quality)
            if hasattr(submission, "preview") and submission.preview:
                preview = submission.preview
                if "images" in preview and preview["images"]:
                    source = preview["images"][0].get("source")
                    if source and "url" in source:
                        header_url = html.unescape(source["url"])
                        self.logger.debug(
                            f"Extracted header image from preview: {header_url}"
                        )
                        return header_url

            # Priority 2: Gallery posts - get first high-quality image
            if (
                hasattr(submission, "is_gallery")
                and submission.is_gallery
                and hasattr(submission, "media_metadata")
                and hasattr(submission, "gallery_data")
            ):
                gallery_items = submission.gallery_data.get("items", [])
                if gallery_items:
                    media_id = gallery_items[0].get("media_id")
                    if media_id and media_id in submission.media_metadata:
                        media_info = submission.media_metadata[media_id]

                        # For animated images, prefer GIF or MP4
                        if media_info.get("e") == "AnimatedImage":
                            if "s" in media_info and "gif" in media_info["s"]:
                                gif_url = html.unescape(media_info["s"]["gif"])
                                self.logger.debug(
                                    f"Extracted header image from gallery GIF: {gif_url}"
                                )
                                return gif_url
                            elif "s" in media_info and "mp4" in media_info["s"]:
                                mp4_url = html.unescape(media_info["s"]["mp4"])
                                self.logger.debug(
                                    f"Extracted header image from gallery MP4: {mp4_url}"
                                )
                                return mp4_url

                        # For regular images, get the high-quality URL
                        elif media_info.get("e") == "Image" and "s" in media_info:
                            image_url = media_info["s"].get("u")
                            if image_url:
                                image_url = html.unescape(image_url)
                                self.logger.debug(
                                    f"Extracted header image from gallery: {image_url}"
                                )
                                return image_url

            # Priority 3: Direct image posts - use URL directly
            if hasattr(submission, "url") and submission.url:
                url = submission.url
                if any(
                    url.lower().endswith(ext)
                    for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]
                ):
                    self.logger.debug(f"Using direct image URL as header: {url}")
                    return url

            # Priority 4: Video posts - use preview
            if "v.redd.it" in getattr(submission, "url", ""):
                preview_url = self._extract_reddit_video_preview(submission)
                if preview_url:
                    self.logger.debug(f"Using video preview as header: {preview_url}")
                    return preview_url

            # Priority 5: Fall back to thumbnail extraction
            thumbnail_url = self._extract_thumbnail_url(submission)
            if thumbnail_url:
                self.logger.debug(
                    f"Falling back to thumbnail as header: {thumbnail_url}"
                )
                return thumbnail_url

            # Priority 6: If no image found, return submission URL to extract image from it
            # This will be processed by standardize_format() which will try to extract
            # an image from the URL using extract_image_from_url()
            if hasattr(submission, "url") and submission.url:
                url = submission.url
                # Only return URL if it's not already an image file (already checked in Priority 3)
                # and not a video (already checked in Priority 4)
                if (
                    not any(
                        url.lower().endswith(ext)
                        for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]
                    )
                    and "v.redd.it" not in url
                ):
                    self.logger.debug(
                        f"No image found, will extract from submission URL: {url}"
                    )
                    return url

            # Priority 7: Extract URLs from text post selftext and try to find images
            # Only if no better image was found above
            if (
                hasattr(submission, "is_self")
                and submission.is_self
                and hasattr(submission, "selftext")
                and submission.selftext
            ):
                urls = self._extract_urls_from_text(submission.selftext)
                if urls:
                    self.logger.debug(
                        f"Found {len(urls)} URL(s) in selftext, checking for images"
                    )
                    # Try each URL - prioritize direct image URLs, then other URLs
                    # The actual image extraction will be done by standardize_format()
                    first_valid_url = None
                    for url in urls:
                        # Skip invalid URLs
                        if not url.startswith(("http://", "https://")):
                            continue
                        # Track first valid URL for fallback
                        if first_valid_url is None:
                            first_valid_url = url
                        # If it's a direct image URL, return it immediately
                        if any(
                            url.lower().endswith(ext)
                            for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]
                        ):
                            self.logger.debug(
                                f"Found direct image URL in selftext: {url}"
                            )
                            return url
                    # If no direct image URLs found, return first valid URL
                    # standardize_format() will try to extract an image from it
                    if first_valid_url:
                        self.logger.debug(
                            f"Found URL in selftext, will extract image: {first_valid_url}"
                        )
                        return first_valid_url

            return None

        except (AttributeError, KeyError, IndexError) as e:
            self.logger.debug(f"Could not extract header image URL: {e}")
            return None

    def _get_sort_by(self) -> str:
        """Get sort method from options."""
        return self.get_option("sort_by", "hot")

    def _get_comment_limit(self) -> int:
        """Get comment limit from options."""
        return int(self.get_option("comment_limit", 10))

    # ============================================================================
    # Main aggregation (override to use Reddit API instead of RSS)
    # ============================================================================

    def aggregate(
        self,
        feed: Any,
        force_refresh: bool = False,
        options: dict | None = None,
        article_limit: int | None = None,
    ) -> int:
        """
        Main aggregation entry point for Reddit.

        Args:
            feed: The Feed object to aggregate
            force_refresh: Whether to re-download existing posts
            options: Dictionary of aggregator-specific options
            article_limit: Maximum number of articles to process (None = no limit)

        Returns:
            Number of new posts added
        """
        self.feed = feed
        self.force_refresh = force_refresh
        self.runtime_options = options or {}

        subreddit_name = self._get_subreddit_name()
        if not subreddit_name:
            self.logger.error(
                f"Could not extract subreddit from identifier: {feed.identifier}"
            )
            return 0

        self.logger.info(f"Starting Reddit aggregation for: r/{subreddit_name}")
        self.on_aggregation_start()

        # Calculate dynamic fetch limit based on daily quota
        limit = self.get_dynamic_fetch_limit(force_refresh)

        # If limit is 0, skip this feed
        if limit == 0:
            self.logger.info(
                f"Skipping r/{subreddit_name}: daily quota exhausted or disabled"
            )
            return 0

        # Get Reddit client and subreddit
        reddit = self.get_reddit_client()
        subreddit = reddit.subreddit(subreddit_name)

        # Get posts based on sort method
        submissions = self.fetch_reddit_posts(subreddit, limit)

        # Collect submissions to process
        submissions_to_process = []
        for submission in submissions:
            # Skip AutoModerator posts
            author = submission.author.name if submission.author else "[deleted]"
            if author == "AutoModerator":
                self.logger.debug(f"Skipping AutoModerator post: {submission.title}")
                continue

            # Skip if post already exists (unless force refresh)
            if (
                not force_refresh
                and Article.objects.filter(external_id=submission.id).exists()
            ):
                self.logger.debug(f"Post already exists: {submission.title}")
                continue

            # Check for duplicate titles if enabled (skip this check when force_refresh is True)
            if not force_refresh and getattr(feed, "skip_duplicates", True):
                from datetime import timedelta

                seven_days_ago = timezone.now() - timedelta(days=7)
                duplicate_exists = Article.objects.filter(
                    feed=feed,
                    name=submission.title[:500],  # Truncate to match field limit
                    created_at__gte=seven_days_ago,
                ).exists()

                if duplicate_exists:
                    self.logger.info(
                        f"Skipping duplicate title from last 7 days: {submission.title}"
                    )
                    continue

            submissions_to_process.append(submission)

        if not submissions_to_process:
            self.logger.info("No new posts to process")
            return 0

        # Apply article limit if specified
        if article_limit is not None and article_limit > 0:
            submissions_to_process = submissions_to_process[:article_limit]
            self.logger.info(
                f"Limiting aggregation to first {article_limit} submissions"
            )

        # Process submissions
        new_posts_count = 0
        for index, submission in enumerate(submissions_to_process):
            try:
                self.logger.info(
                    f"Processing [{index + 1}/{len(submissions_to_process)}]: {submission.title}"
                )

                # Parse creation date
                post_date = timezone.make_aware(
                    datetime.fromtimestamp(submission.created_utc)
                )

                # Skip posts older than 2 months
                if is_content_too_old(post_date):
                    self.logger.info(
                        f"Skipping old post from {post_date.date()}: {submission.title}"
                    )
                    continue

                # Build content with comments
                content = self.build_post_content(submission)

                # Create RawArticle for standardization
                permalink = f"https://reddit.com{submission.permalink}"
                article = RawArticle(
                    url=permalink,
                    title=submission.title,
                    date=post_date,
                    content=content,
                    entry={},  # Not used for Reddit
                )

                # Extract thumbnail URL for header image
                thumbnail_url = self._extract_thumbnail_url(submission)
                header_image_url = self._get_header_image_url(submission)

                # Standardize content format
                article.html = content
                self.standardize_format(article, header_image_url=header_image_url)

                # Save to database
                author = submission.author.name if submission.author else "[deleted]"

                # Use current timestamp if feed is configured for it (default: True)
                if getattr(feed, "use_current_timestamp", True):
                    save_date = timezone.now()
                else:
                    save_date = post_date

                # Set media_url for Reddit videos (v.redd.it) - use embed URL
                media_url = ""
                if (
                    hasattr(submission, "url")
                    and submission.url
                    and "v.redd.it" in submission.url
                ):
                    # Reddit embed URL format: https://www.reddit.com/r/{subreddit}/comments/{post_id}/embed
                    # The permalink already has the correct format, just append /embed
                    media_url = f"{permalink}/embed"

                _, created = Article.objects.update_or_create(
                    external_id=submission.id,
                    defaults={
                        "feed": feed,
                        "name": submission.title[:500],  # Truncate to fit field
                        "url": permalink,
                        "author": author,
                        "score": submission.score,
                        "date": save_date,
                        "content": article.html,
                        "thumbnail_url": thumbnail_url or "",
                        "media_url": media_url,
                    },
                )

                if created:
                    new_posts_count += 1
                    self.logger.info(f"Created new post: {submission.title}")
                    self.on_article_created(article)
                else:
                    self.logger.info(f"Updated existing post: {submission.title}")

            except Exception as e:
                self.logger.error(
                    f"Error processing post {submission.id}: {e}", exc_info=True
                )
                self.on_article_error(submission, e)
                continue

        self.on_aggregation_complete(new_posts_count)
        self.logger.info(f"Completed r/{subreddit_name}: {new_posts_count} new posts")

        return new_posts_count

    # ============================================================================
    # Preview support (fetch_rss_feed for compatibility with preview)
    # ============================================================================

    def fetch_rss_feed(self, feed_identifier: str) -> Any:
        """
        Fetch Reddit posts and convert them to a feedparser-like structure for preview.

        This method is called by the preview system to fetch posts without saving them.
        It returns a mock feedparser object with an `.entries` list that can be processed
        by the standard preview pipeline.

        Args:
            feed_identifier: Subreddit identifier (e.g., "python", "r/python")

        Returns:
            Mock feedparser-like object with `.entries` list of Reddit post entries

        Raises:
            ValueError: If subreddit cannot be accessed or Reddit API credentials are missing
        """
        import time
        from datetime import datetime

        # Normalize subreddit name
        subreddit_name = normalize_subreddit(feed_identifier)
        if not subreddit_name:
            raise ValueError(f"Invalid subreddit identifier: {feed_identifier}")

        try:
            # Get Reddit client
            reddit = self.get_reddit_client()
            subreddit = reddit.subreddit(subreddit_name)

            # Fetch posts (limit to 1 for preview)
            sort_method = self._get_sort_by()
            limit = 1  # Preview only needs 1 post

            if sort_method == "hot":
                submissions = list(subreddit.hot(limit=limit))
            elif sort_method == "new":
                submissions = list(subreddit.new(limit=limit))
            elif sort_method == "top":
                submissions = list(subreddit.top(limit=limit, time_filter="day"))
            elif sort_method == "rising":
                submissions = list(subreddit.rising(limit=limit))
            else:
                submissions = list(subreddit.hot(limit=limit))

            if not submissions:
                raise ValueError(f"No posts found in r/{subreddit_name}")

            # Convert submissions to entry-like dicts
            entries = []
            for submission in submissions:
                # Parse creation date
                post_date = datetime.fromtimestamp(submission.created_utc)
                # Convert to struct_time for feedparser compatibility
                published_parsed = time.struct_time(
                    post_date.timetuple()[:6] + (0, 0, 0)
                )

                # Build content summary
                content_summary = ""
                if submission.is_self and submission.selftext:
                    # Text post - use selftext as summary
                    content_summary = submission.selftext[:500]  # Truncate for preview
                elif hasattr(submission, "url") and submission.url:
                    # Link post - use URL
                    content_summary = f"Link: {submission.url}"

                # Create entry-like dict
                entry = {
                    "title": submission.title,
                    "link": f"https://reddit.com{submission.permalink}",
                    "published_parsed": published_parsed,
                    "summary": content_summary,
                    "author": submission.author.name
                    if submission.author
                    else "[deleted]",
                    "_reddit_submission": submission,  # Store original for processing
                    "_reddit_id": submission.id,
                }
                entries.append(entry)

            # Create mock feedparser-like object
            class MockFeed:
                def __init__(self, entries):
                    self.entries = entries

            self.logger.info(
                f"Successfully fetched {len(entries)} post(s) from r/{subreddit_name} for preview"
            )

            return MockFeed(entries)

        except ValueError:
            # Re-raise ValueError as-is
            raise
        except Exception as e:
            error_msg = f"Error fetching Reddit posts: {e}"
            self.logger.error(error_msg, exc_info=True)
            raise ValueError(error_msg) from e

    # ============================================================================
    # Reddit API methods
    # ============================================================================

    def get_reddit_client(self) -> praw.Reddit:
        """
        Get or create a Reddit API client using environment credentials.

        Returns:
            Configured PRAW Reddit instance

        Raises:
            ValueError: If required Reddit API credentials are not configured
        """
        if self._reddit_client is not None:
            return self._reddit_client

        client_id = getattr(settings, "REDDIT_CLIENT_ID", None)
        client_secret = getattr(settings, "REDDIT_CLIENT_SECRET", None)
        user_agent = getattr(settings, "REDDIT_USER_AGENT", "Yana/1.0")

        if not client_id or not client_secret:
            raise ValueError(
                "Reddit API credentials not configured. "
                "Please set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET environment variables."
            )

        self._reddit_client = praw.Reddit(
            client_id=client_id,
            client_secret=client_secret,
            user_agent=user_agent,
        )

        return self._reddit_client

    def parse_entry(self, entry: Any) -> RawArticle:
        """
        Parse Reddit entry into a RawArticle.

        This method handles both:
        1. Reddit submission objects (from aggregate)
        2. Entry-like dicts (from fetch_rss_feed for preview)

        Args:
            entry: Reddit submission object or entry-like dict

        Returns:
            RawArticle with parsed data
        """
        # Check if this is a Reddit submission object (from aggregate)
        if hasattr(entry, "id") and hasattr(entry, "title"):
            # This is a PRAW Submission object - convert to RawArticle directly
            from datetime import datetime

            post_date = timezone.make_aware(datetime.fromtimestamp(entry.created_utc))
            permalink = f"https://reddit.com{entry.permalink}"

            # Build content
            content = self.build_post_content(entry)

            return RawArticle(
                url=permalink,
                title=entry.title,
                date=post_date,
                content=content,
                entry={"author": entry.author.name if entry.author else "[deleted]"},
            )

        # Otherwise, it's an entry-like dict from fetch_rss_feed
        # Use base implementation which expects dict with 'link', 'title', etc.
        article = super().parse_entry(entry)

        # If we have the original submission stored, build content for preview
        # Use build_post_content to show the same output as final result (including comments)
        if "_reddit_submission" in entry:
            submission = entry["_reddit_submission"]
            # Build full content with comments to match final output
            content = self.build_post_content(submission)
            article.content = content
            article.html = content

            # Extract thumbnail URL for preview display
            thumbnail_url = self._extract_thumbnail_url(submission)
            if thumbnail_url:
                article.thumbnail_url = thumbnail_url

        return article

    def fetch_reddit_posts(self, subreddit: Any, limit: int) -> Any:
        """
        Fetch posts from a subreddit based on the configured sort method.

        Args:
            subreddit: PRAW Subreddit object
            limit: Maximum number of posts to fetch

        Returns:
            Iterator of PRAW Submission objects
        """
        sort_method = self._get_sort_by()

        if sort_method == "hot":
            return subreddit.hot(limit=limit)
        elif sort_method == "new":
            return subreddit.new(limit=limit)
        elif sort_method == "top":
            return subreddit.top(limit=limit, time_filter="day")
        elif sort_method == "rising":
            return subreddit.rising(limit=limit)
        else:
            return subreddit.hot(limit=limit)

    # ============================================================================
    # Content building methods
    # ============================================================================

    def fetch_article_html(self, article: RawArticle) -> str:
        """
        Fetch HTML content for a Reddit article.

        For Reddit posts, we already have the content built from the submission,
        so we return it directly without fetching from the web.

        Args:
            article: RawArticle with content already built

        Returns:
            HTML content string
        """
        # If content is already set (from parse_entry), use it
        if article.html:
            return article.html

        # Fallback to base implementation (shouldn't happen for Reddit)
        return super().fetch_article_html(article)

    def build_post_content(self, submission: Any) -> str:
        """
        Build HTML content for a Reddit post including top comments.

        Args:
            submission: PRAW Submission object

        Returns:
            HTML formatted content with post body and comments
        """
        content_parts = []

        # Post content (selftext or link)
        if submission.is_self and submission.selftext:
            # Text post - convert Reddit markdown to HTML
            selftext_html = self.convert_reddit_markdown(submission.selftext)
            content_parts.append(f"<div>{selftext_html}</div>")
        elif hasattr(submission, "is_gallery") and submission.is_gallery:
            # Reddit gallery - extract all images at high resolution
            if hasattr(submission, "media_metadata") and hasattr(
                submission, "gallery_data"
            ):
                gallery_items = submission.gallery_data.get("items", [])

                for item in gallery_items:
                    media_id = item.get("media_id")
                    caption = item.get("caption", "")

                    if media_id and media_id in submission.media_metadata:
                        media_info = submission.media_metadata[media_id]

                        # Check if it's an animated GIF
                        if media_info.get("e") == "AnimatedImage":
                            gif_url = None
                            if "s" in media_info and "gif" in media_info["s"]:
                                gif_url = html.unescape(media_info["s"]["gif"])
                            elif "s" in media_info and "mp4" in media_info["s"]:
                                gif_url = html.unescape(media_info["s"]["mp4"])

                            if gif_url:
                                if caption:
                                    content_parts.append(
                                        f'<figure><img src="{gif_url}" alt="{html.escape(caption)}"><figcaption>{html.escape(caption)}</figcaption></figure>'
                                    )
                                else:
                                    content_parts.append(
                                        f'<p><img src="{gif_url}" alt="Animated GIF"></p>'
                                    )
                        elif media_info.get("e") == "Image" and "s" in media_info:
                            image_url = media_info["s"].get("u")
                            if image_url:
                                image_url = html.unescape(image_url)
                                if caption:
                                    content_parts.append(
                                        f'<figure><img src="{image_url}" alt="{html.escape(caption)}"><figcaption>{html.escape(caption)}</figcaption></figure>'
                                    )
                                else:
                                    content_parts.append(
                                        f'<p><img src="{image_url}" alt="Gallery image"></p>'
                                    )
            else:
                self.logger.warning(f"Gallery post missing metadata: {submission.id}")
        elif hasattr(submission, "url") and submission.url:
            # Link post
            url = submission.url

            if url.lower().endswith(".gif") or url.lower().endswith(".gifv"):
                gif_url = self._extract_animated_gif_url(submission)
                if gif_url:
                    content_parts.append(
                        f'<p><img src="{gif_url}" alt="Animated GIF"></p>'
                    )
                else:
                    if url.lower().endswith(".gifv"):
                        url = url[:-1]
                    content_parts.append(f'<p><img src="{url}" alt="Animated GIF"></p>')
            elif any(
                url.lower().endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp"]
            ):
                content_parts.append(f'<p><img src="{url}" alt="Post image"></p>')
            elif "v.redd.it" in url:
                preview_url = self._extract_reddit_video_preview(submission)
                if preview_url:
                    content_parts.append(
                        f'<p><img src="{preview_url}" alt="Video thumbnail"></p>'
                    )
                    content_parts.append(f'<p><a href="{url}">▶ View Video</a></p>')
                else:
                    content_parts.append(f'<p><a href="{url}">▶ View Video</a></p>')
            elif "youtube.com" in url or "youtu.be" in url:
                # Create a link - standardize_format will convert it to an embed
                content_parts.append(
                    f'<p><a href="{url}">▶ View Video on YouTube</a></p>'
                )
            else:
                content_parts.append(f'<p><a href="{url}">{html.escape(url)}</a></p>')

        # Comments section
        permalink = f"https://reddit.com{submission.permalink}"
        content_parts.append(
            f'<h3><a href="{permalink}" target="_blank" rel="noopener">Comments</a></h3>'
        )

        # Sort comments by score and get top ones
        submission.comment_sort = "best"
        submission.comments.replace_more(limit=0)

        comment_count = 0
        comment_htmls = []

        comment_limit = self._get_comment_limit()
        max_to_check = comment_limit * 2

        for comment in submission.comments:
            if comment_count >= max_to_check:
                break
            if isinstance(comment, MoreComments):
                continue

            if comment_count >= comment_limit:
                break

            # Skip bot comments
            author = comment.author.name if comment.author else "[deleted]"
            if (
                author.lower().endswith("_bot")
                or author.lower().endswith("-bot")
                or author == "AutoModerator"
            ):
                continue

            comment_htmls.append(self.format_comment_html(comment))
            comment_count += 1

        if comment_htmls:
            content_parts.append("".join(comment_htmls))

        if comment_count == 0:
            content_parts.append("<p><em>No comments yet.</em></p>")

        return "".join(content_parts)

    def format_comment_html(self, comment: Any) -> str:
        """Format a single comment as HTML with link."""
        author = comment.author.name if comment.author else "[deleted]"
        body = self.convert_reddit_markdown(comment.body)
        comment_url = f"https://reddit.com{comment.permalink}"

        return f"""
<blockquote>
<p><strong>{html.escape(author)}</strong> | <a href="{comment_url}">source</a></p>
<div>{body}</div>
</blockquote>
"""

    def convert_reddit_markdown(self, text: str) -> str:
        """
        Convert Reddit markdown to HTML.

        Handles Reddit-specific markdown extensions like ^superscript,
        ~~strikethrough~~, >!spoilers!<, and Giphy embeds.
        """
        if not text:
            return ""

        # Handle Reddit preview images
        text = re.sub(
            r"(?<![\[\(])https?://preview\.redd\.it/[^\s\)]+",
            lambda m: f'<img src="{m.group(0)}" alt="Reddit preview image">',
            text,
        )

        # Convert markdown links with preview.redd.it URLs to image tags
        text = re.sub(
            r"\[([^\]]*)\]\((https?://preview\.redd\.it/[^\)]+)\)",
            lambda m: f'<img src="{m.group(2)}" alt="{html.escape(m.group(1)) if m.group(1) else "Reddit preview image"}">',
            text,
        )

        # Handle Giphy images
        text = re.sub(
            r"!\[([^\]]*)\]\(giphy\|([a-zA-Z0-9]+)(?:\|[^\)]+)?\)",
            lambda m: f'<img src="https://i.giphy.com/{m.group(2)}.gif" alt="Giphy GIF">',
            text,
            flags=re.IGNORECASE,
        )

        text = re.sub(
            r'<img\s+[^>]*src=\s*["\']giphy\|([^"\'\|]+)[^"\']*["\'][^>]*>',
            lambda m: f'<img src="https://i.giphy.com/{m.group(1)}.gif" alt="Giphy GIF">',
            text,
            flags=re.IGNORECASE,
        )

        text = re.sub(
            r"(?<![\"\'])giphy\|([a-zA-Z0-9]+)(?![\"\'])",
            lambda m: f'<img src="https://i.giphy.com/{m.group(1)}.gif" alt="Giphy GIF">',
            text,
        )

        # Handle Reddit-specific superscript syntax
        text = re.sub(r"\^(\w+)", r"<sup>\1</sup>", text)
        text = re.sub(r"\^\(([^)]+)\)", r"<sup>\1</sup>", text)

        # Handle strikethrough
        text = re.sub(r"~~(.+?)~~", r"<del>\1</del>", text)

        # Handle spoiler syntax
        text = re.sub(
            r"&gt;!(.+?)!&lt;|>!(.+?)!<",
            r'<span class="spoiler" style="background: #000; color: #000;">\1\2</span>',
            text,
        )

        # Reset and convert
        self._md.reset()
        html_content = self._md.convert(text)

        return html_content

    def _extract_reddit_video_preview(self, submission: Any) -> str | None:
        """Extract preview/thumbnail image URL from a Reddit video post."""
        try:
            if not hasattr(submission, "preview"):
                return None

            preview = submission.preview
            if not preview or "images" not in preview:
                return None

            images = preview["images"]
            if not images or len(images) == 0:
                return None

            source = images[0].get("source")
            if source and "url" in source:
                preview_url = html.unescape(source["url"])
                self.logger.debug(f"Extracted Reddit video preview: {preview_url}")
                return preview_url

            return None

        except (AttributeError, KeyError, IndexError) as e:
            self.logger.debug(f"Could not extract Reddit video preview: {e}")
            return None

    def _extract_animated_gif_url(self, submission: Any) -> str | None:
        """Extract animated GIF URL from Reddit preview data."""
        try:
            if not hasattr(submission, "preview"):
                return None

            preview = submission.preview
            if not preview or "images" not in preview:
                return None

            images = preview["images"]
            if not images or len(images) == 0:
                return None

            image_data = images[0]

            if "variants" in image_data and "gif" in image_data["variants"]:
                gif_variant = image_data["variants"]["gif"]
                if "source" in gif_variant and "url" in gif_variant["source"]:
                    gif_url = html.unescape(gif_variant["source"]["url"])
                    self.logger.debug(f"Extracted animated GIF URL: {gif_url}")
                    return gif_url

            if "variants" in image_data and "mp4" in image_data["variants"]:
                mp4_variant = image_data["variants"]["mp4"]
                if "source" in mp4_variant and "url" in mp4_variant["source"]:
                    mp4_url = html.unescape(mp4_variant["source"]["url"])
                    self.logger.debug(f"Extracted animated MP4 URL: {mp4_url}")
                    return mp4_url

            return None

        except (AttributeError, KeyError, IndexError) as e:
            self.logger.debug(f"Could not extract animated GIF URL: {e}")
            return None

    def _extract_urls_from_text(self, text: str) -> list[str]:
        """
        Extract URLs from Reddit post text (selftext).

        Handles both plain URLs and markdown links [text](url).

        Args:
            text: The post text to extract URLs from

        Returns:
            List of extracted URLs
        """
        if not text:
            return []

        urls = []

        # Pattern for markdown links: [text](url)
        markdown_link_pattern = r"\[([^\]]*)\]\((https?://[^\)]+)\)"
        markdown_matches = re.findall(markdown_link_pattern, text)
        for _, url in markdown_matches:
            urls.append(url)

        # Pattern for plain URLs: http:// or https://
        # This regex matches URLs but avoids matching URLs already found in markdown links
        plain_url_pattern = r"(?<!\]\()(https?://[^\s\)]+)"
        plain_matches = re.findall(plain_url_pattern, text)
        for url in plain_matches:
            # Remove trailing punctuation that might be part of the sentence
            url = url.rstrip(".,;:!?)")
            if url not in urls:
                urls.append(url)

        return urls

    # ============================================================================
    # Override _get_source_name for logging
    # ============================================================================

    def _get_source_name(self) -> str:
        """Get a human-readable name for the subreddit for logging."""
        subreddit = self._get_subreddit_name()
        if subreddit:
            return f"r/{subreddit}"
        return "Unknown Subreddit"


# Module-level wrapper for compatibility
def aggregate(feed, force_refresh=False, options=None):
    """Module-level wrapper for admin interface."""
    aggregator = RedditAggregator()
    return aggregator.aggregate(feed, force_refresh, options or {})
