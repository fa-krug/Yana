"""Database models for the application."""

import secrets
from datetime import timedelta

from django.db import models
from django.utils import timezone

from .choices import AGGREGATOR_CHOICES


class FeedGroup(models.Model):
    """Feed group for organizing feeds."""

    name = models.CharField(max_length=255)
    user = models.ForeignKey("auth.User", on_delete=models.CASCADE, related_name="feed_groups")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Feed Group"
        verbose_name_plural = "Feed Groups"
        unique_together = [["name", "user"]]
        ordering = ["name"]

    def __str__(self):
        return self.name


class Feed(models.Model):
    """Feed configuration for content aggregation."""

    name = models.CharField(max_length=255)
    aggregator = models.CharField(max_length=50, choices=AGGREGATOR_CHOICES, default="full_website")
    identifier = models.TextField(
        blank=True,
        default="",
        help_text="Required for Reddit and YouTube aggregators. For others, optional URL or identifier.",
    )
    daily_limit = models.IntegerField(default=20)
    enabled = models.BooleanField(default=True)
    user = models.ForeignKey(
        "auth.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="feeds"
    )
    group = models.ForeignKey(
        FeedGroup, on_delete=models.SET_NULL, null=True, blank=True, related_name="feeds"
    )
    icon = models.ImageField(upload_to="feed_icons/", blank=True, null=True)
    options = models.JSONField(
        default=dict, blank=True, help_text="Aggregator-specific configuration"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Feed"
        verbose_name_plural = "Feeds"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user"]),
            models.Index(fields=["group"]),
            models.Index(fields=["aggregator"]),
        ]

    def __str__(self):
        return self.name


class Article(models.Model):
    """Article from a feed."""

    name = models.CharField(max_length=500)  # Article title
    identifier = models.TextField()  # URL or external ID
    raw_content = models.TextField(help_text="Raw HTML content")
    content = models.TextField(help_text="Processed content")
    date = models.DateTimeField(default=timezone.now)
    read = models.BooleanField(default=False)
    starred = models.BooleanField(default=False)
    author = models.CharField(max_length=255, blank=True, default="")
    icon = models.ImageField(upload_to="article_icons/", blank=True, null=True)
    feed = models.ForeignKey(Feed, on_delete=models.CASCADE, related_name="articles")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Article"
        verbose_name_plural = "Articles"
        ordering = ["-date"]
        indexes = [
            models.Index(fields=["feed", "identifier"]),
            models.Index(fields=["feed", "date"]),
            models.Index(fields=["date"]),
            models.Index(fields=["read"]),
            models.Index(fields=["starred"]),
            models.Index(fields=["feed", "read", "date"]),
        ]

    def __str__(self):
        return self.name


class UserSettings(models.Model):
    """User settings for API credentials and preferences."""

    user = models.OneToOneField(
        "auth.User", on_delete=models.CASCADE, related_name="user_settings", unique=True
    )

    # Reddit API
    reddit_enabled = models.BooleanField(default=False)
    reddit_client_id = models.CharField(max_length=255, blank=True, default="")
    reddit_client_secret = models.CharField(max_length=255, blank=True, default="")
    reddit_user_agent = models.CharField(max_length=255, default="Yana/1.0")

    # YouTube API
    youtube_enabled = models.BooleanField(default=False)
    youtube_api_key = models.CharField(max_length=255, blank=True, default="")

    # OpenAI API
    openai_enabled = models.BooleanField(default=False)
    openai_api_url = models.CharField(max_length=255, default="https://api.openai.com/v1")
    openai_api_key = models.CharField(max_length=255, blank=True, default="")
    ai_model = models.CharField(max_length=100, default="gpt-4o-mini")
    ai_temperature = models.FloatField(default=0.3)
    ai_max_tokens = models.IntegerField(default=2000)
    ai_default_daily_limit = models.IntegerField(default=200)
    ai_default_monthly_limit = models.IntegerField(default=2000)
    ai_max_prompt_length = models.IntegerField(default=500)
    ai_request_timeout = models.IntegerField(default=120)
    ai_max_retries = models.IntegerField(default=3)
    ai_retry_delay = models.IntegerField(default=2)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "User Settings"
        verbose_name_plural = "User Settings"
        indexes = [
            models.Index(fields=["user"]),
        ]

    def __str__(self):
        return f"Settings for {self.user.username}"


class GReaderAuthToken(models.Model):
    """Google Reader API authentication token."""

    user = models.ForeignKey("auth.User", on_delete=models.CASCADE, related_name="greader_tokens")
    token = models.CharField(max_length=64, unique=True, db_index=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Google Reader Auth Token"
        verbose_name_plural = "Google Reader Auth Tokens"
        indexes = [
            models.Index(fields=["token"]),
            models.Index(fields=["user"]),
        ]

    def __str__(self):
        return f"GReader Token for {self.user.username}"

    def is_valid(self) -> bool:
        """Check if the token is still valid."""
        return not (self.expires_at and self.expires_at < timezone.now())

    @classmethod
    def generate_for_user(cls, user, days: int = 7):
        """Generate a new token for the user."""
        token = secrets.token_hex(32)
        expires_at = timezone.now() + timedelta(days=days)
        return cls.objects.create(user=user, token=token, expires_at=expires_at)
