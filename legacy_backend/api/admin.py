"""
Django admin configuration for API models.
"""

import logging

from django.contrib import admin, messages
from django.db.models import Q, QuerySet
from django.http import HttpRequest
from djangoql.admin import DjangoQLSearchMixin

from .models import GReaderAuthToken, Group, UserArticleState

logger = logging.getLogger(__name__)


@admin.register(Group)
class GroupAdmin(DjangoQLSearchMixin, admin.ModelAdmin):
    """Admin interface for Group model (API feed groups)."""

    list_display = (
        "name",
        "user",
        "feed_count",
        "created_at",
        "updated_at",
    )
    list_filter = ("user", "created_at")
    search_fields = ("name",)
    readonly_fields = ("created_at", "updated_at", "feed_count")
    fieldsets = (
        ("Group Information", {"fields": ("name", "user")}),
        (
            "Feeds",
            {
                "fields": ("feed_count",),
                "description": "Feeds are assigned to groups from the Feed admin page.",
            },
        ),
        (
            "Metadata",
            {"fields": ("created_at", "updated_at"), "classes": ("collapse",)},
        ),
    )

    def get_queryset(self, request: HttpRequest) -> QuerySet[Group]:
        """
        Filter groups based on user permissions.

        - Superusers see all groups
        - Regular users see only their own groups + shared groups (user=NULL)
        """
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(Q(user=request.user) | Q(user__isnull=True))

    def feed_count(self, obj: Group) -> int:
        """Return the number of feeds in this group."""
        return obj.feeds.count()

    feed_count.short_description = "Feeds"  # type: ignore


@admin.register(GReaderAuthToken)
class GReaderAuthTokenAdmin(DjangoQLSearchMixin, admin.ModelAdmin):
    """Admin interface for GReaderAuthToken model (Google Reader API auth tokens)."""

    list_display = (
        "user",
        "token_preview",
        "is_valid_display",
        "expires_at",
        "created_at",
        "updated_at",
    )
    list_filter = ("created_at", "expires_at")
    search_fields = ("user__username", "user__email", "token")
    readonly_fields = ("token", "created_at", "updated_at")
    fieldsets = (
        (
            "Token Information",
            {
                "fields": ("user", "token", "expires_at"),
                "description": "Auth tokens are generated automatically when users authenticate via /accounts/ClientLogin",
            },
        ),
        (
            "Metadata",
            {"fields": ("created_at", "updated_at"), "classes": ("collapse",)},
        ),
    )

    def get_queryset(self, request: HttpRequest) -> QuerySet[GReaderAuthToken]:
        """
        Filter auth tokens based on user permissions.

        - Superusers see all tokens
        - Regular users see only their own tokens
        """
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(user=request.user)

    def token_preview(self, obj: GReaderAuthToken) -> str:
        """Return a preview of the token (first 8 chars)."""
        return f"{obj.token[:8]}..." if obj.token else "-"

    token_preview.short_description = "Token"  # type: ignore

    def is_valid_display(self, obj: GReaderAuthToken) -> bool:
        """Return whether the token is still valid."""
        return obj.is_valid()

    is_valid_display.short_description = "Valid"  # type: ignore
    is_valid_display.boolean = True  # type: ignore


@admin.register(UserArticleState)
class UserArticleStateAdmin(DjangoQLSearchMixin, admin.ModelAdmin):
    """Admin interface for UserArticleState model (Google Reader API read/saved states)."""

    list_display = ("user", "article", "is_read", "is_saved", "updated_at")
    list_filter = ("is_read", "is_saved", "user", "updated_at")
    search_fields = ("user__username", "article__name")
    readonly_fields = ("created_at", "updated_at")
    raw_id_fields = ("article",)
    list_select_related = ("user", "article")
    actions = ["mark_as_read", "mark_as_unread", "mark_as_saved", "mark_as_unsaved"]

    def get_queryset(self, request: HttpRequest) -> QuerySet[UserArticleState]:
        """
        Filter article states based on permissions.

        - Superusers see all states
        - Regular users see only their own states
        """
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(user=request.user)

    @admin.action(description="Mark selected as read")
    def mark_as_read(self, request: HttpRequest, queryset: QuerySet) -> None:
        """Mark selected article states as read."""
        updated = queryset.update(is_read=True)
        self.message_user(
            request, f"Marked {updated} article(s) as read.", messages.SUCCESS
        )

    @admin.action(description="Mark selected as unread")
    def mark_as_unread(self, request: HttpRequest, queryset: QuerySet) -> None:
        """Mark selected article states as unread."""
        updated = queryset.update(is_read=False)
        self.message_user(
            request, f"Marked {updated} article(s) as unread.", messages.SUCCESS
        )

    @admin.action(description="Mark selected as saved")
    def mark_as_saved(self, request: HttpRequest, queryset: QuerySet) -> None:
        """Mark selected article states as saved."""
        updated = queryset.update(is_saved=True)
        self.message_user(
            request, f"Marked {updated} article(s) as saved.", messages.SUCCESS
        )

    @admin.action(description="Mark selected as unsaved")
    def mark_as_unsaved(self, request: HttpRequest, queryset: QuerySet) -> None:
        """Mark selected article states as unsaved."""
        updated = queryset.update(is_saved=False)
        self.message_user(
            request, f"Marked {updated} article(s) as unsaved.", messages.SUCCESS
        )
