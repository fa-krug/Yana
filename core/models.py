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
    identifier = models.TextField(help_text="URL, subreddit, or channel identifier")
    daily_limit = models.IntegerField(default=50)
    enabled = models.BooleanField(default=True)
    user = models.ForeignKey(
        "auth.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="feeds"
    )
    group = models.ForeignKey(
        FeedGroup, on_delete=models.SET_NULL, null=True, blank=True, related_name="feeds"
    )
    icon = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Feed"
        verbose_name_plural = "Feeds"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user"]),
            models.Index(fields=["group"]),
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
    icon = models.TextField(blank=True, default="")
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
        ]

    def __str__(self):
        return self.name
