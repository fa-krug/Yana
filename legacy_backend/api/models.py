"""
API models for external integrations.

Contains models for authentication tokens and user state tracking
used by the Google Reader API and other integrations.
"""

import logging

from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import Article

logger = logging.getLogger(__name__)


class Group(models.Model):
    """
    Represents a group/category for organizing feeds.

    Used by the Google Reader API to organize feeds into groups.

    Attributes:
        name: Human-readable name of the group
        user: The user who owns this group (optional, None = shared)
    """

    name = models.CharField(max_length=255, help_text="Name of the group")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="api_groups",
        null=True,
        blank=True,
        help_text="User who owns this group (None = shared)",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Group"
        verbose_name_plural = "Groups"
        unique_together = [["name", "user"]]

    def __str__(self) -> str:
        return self.name

    def __repr__(self) -> str:
        return f"<Group: {self.name}>"


class GReaderAuthToken(models.Model):
    """
    Stores Google Reader API authentication tokens for users.

    The auth token is generated during ClientLogin and used in
    the Authorization header for subsequent requests.

    Attributes:
        user: The user this token belongs to
        token: The authentication token (SHA-256 hash)
        expires_at: When the token expires (optional, can be long-lived)
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="greader_tokens",
        help_text="User this token belongs to",
    )
    token = models.CharField(
        max_length=64, unique=True, db_index=True, help_text="Authentication token"
    )
    expires_at = models.DateTimeField(
        null=True, blank=True, help_text="When the token expires (null = never)"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "GReader Auth Token"
        verbose_name_plural = "GReader Auth Tokens"

    def __str__(self) -> str:
        return f"Token for {self.user.username}"

    def __repr__(self) -> str:
        return f"<GReaderAuthToken: {self.user.username}>"

    def is_valid(self) -> bool:
        """Check if the token is still valid."""
        if self.expires_at is None:
            return True
        return self.expires_at > timezone.now()


class UserArticleState(models.Model):
    """
    Tracks per-user state for articles (read/saved).

    Used by the Google Reader API to track which articles a user has read or saved.

    Attributes:
        user: The user
        article: The article
        is_read: Whether the user has read this article
        is_saved: Whether the user has saved this article
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="article_states",
        help_text="User who owns this state",
    )
    article = models.ForeignKey(
        Article,
        on_delete=models.CASCADE,
        related_name="user_states",
        help_text="Article this state belongs to",
    )
    is_read = models.BooleanField(
        default=False, help_text="Whether the article is read"
    )
    is_saved = models.BooleanField(
        default=False, help_text="Whether the article is saved"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "User Article State"
        verbose_name_plural = "User Article States"
        unique_together = [["user", "article"]]
        indexes = [
            models.Index(fields=["user", "is_read"]),
            models.Index(fields=["user", "is_saved"]),
            # Composite index for efficient state lookups
            models.Index(fields=["user", "article", "is_read"]),
            # Index for efficient feed-level read status queries
            models.Index(fields=["user", "is_read", "article"]),
        ]

    def __str__(self) -> str:
        status = []
        if self.is_read:
            status.append("read")
        if self.is_saved:
            status.append("saved")
        return f"{self.user.username} - {self.article.name}: {', '.join(status) or 'unread'}"

    def __repr__(self) -> str:
        return f"<UserArticleState: {self.user.username}/{self.article.id}>"
