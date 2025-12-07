"""
Django admin configuration for core models.
"""

import logging

from django.conf import settings
from django.contrib import admin, messages
from django.db.models import Q, QuerySet
from django.http import HttpRequest, HttpResponse
from django.shortcuts import redirect
from django.urls import URLPattern, path
from django.utils.html import format_html
from djangoql.admin import DjangoQLSearchMixin

from aggregators import get_aggregator_class
from core.services.aggregation_service import AggregationService

from .admin_form import FeedAdminForm
from .admin_views import (
    create_feed_from_aggregator,
    get_aggregator_info,
    select_aggregator_view,
)
from .models import Article, Feed, UserAIQuota

logger = logging.getLogger(__name__)


@admin.register(Feed)
class FeedAdmin(DjangoQLSearchMixin, admin.ModelAdmin):
    """Admin interface for Feed model."""

    form = FeedAdminForm
    # Base list_display - AI fields added dynamically in get_list_display()
    list_display = (
        "name",
        "user_display",
        "enabled",
        "aggregator_display",
        "groups_display",
        "article_count",
        "feed_link",
        "created_at",
        "updated_at",
    )
    list_filter = (
        "enabled",
        "created_at",
        "updated_at",
        "aggregator",
        "groups",
        "user",
    )
    list_editable = ("enabled",)
    search_fields = ("name", "identifier", "aggregator")
    readonly_fields = (
        "created_at",
        "updated_at",
        "article_count",
        "feed_link",
        "aggregator_info_display",
    )
    filter_horizontal = ("groups",)
    actions = [
        "run_aggregation",
        "force_run_aggregation",
        "enable_feeds",
        "disable_feeds",
    ]
    fieldsets = (
        (
            "Feed Information",
            {
                "fields": (
                    "user",
                    "name",
                    "identifier",
                    "icon",
                    "aggregator",
                    "enabled",
                    "generate_title_image",
                    "add_source_footer",
                    "use_current_timestamp",
                )
            },
        ),
        (
            "Aggregator Information",
            {
                "fields": ("aggregator_info_display",),
                "classes": ("collapse",),
            },
        ),
        (
            "Groups",
            {
                "fields": ("groups",),
                "description": "Assign this feed to one or more groups for organization.",
            },
        ),
        ("Example Content", {"fields": ("example",), "classes": ("collapse",)}),
        (
            "Metadata",
            {
                "fields": ("article_count", "feed_link", "created_at", "updated_at"),
                "classes": ("collapse",),
            },
        ),
    )

    def get_queryset(self, request: HttpRequest) -> QuerySet[Feed]:
        """
        Filter queryset based on user permissions.

        - Superusers see all feeds
        - Regular users see only their own feeds + shared feeds (user=NULL)
        """
        qs = super().get_queryset(request).prefetch_related("groups")
        if request.user.is_superuser:
            return qs
        return qs.filter(Q(user=request.user) | Q(user__isnull=True))

    def get_form(
        self,
        request: HttpRequest,
        obj: Feed | None = None,
        change: bool = False,
        **kwargs,
    ):
        """
        Override get_form to handle dynamic option fields.

        The option fields are created dynamically in the form's __init__(),
        but Django tries to validate fieldsets before the form is instantiated.
        We need to exclude the dynamic fields from validation.
        """
        # Get the fields from kwargs or from fieldsets
        if "fields" in kwargs:
            fields = kwargs["fields"]
            if fields:
                # Filter out dynamic option_ fields since they don't exist on the model
                # They'll be added by the form's __init__()
                kwargs["fields"] = [f for f in fields if not f.startswith("option_")]

        return super().get_form(request, obj, change, **kwargs)

    def get_list_display(self, request: HttpRequest) -> tuple[str, ...]:
        """Conditionally add AI features column if AI is enabled."""
        display_fields = list(super().get_list_display(request))

        # Add AI features column after groups_display if AI is enabled
        if settings.AI_ENABLED:
            # Find index of groups_display
            try:
                idx = display_fields.index("groups_display")
                display_fields.insert(idx + 1, "ai_features_display")
            except ValueError:
                # If groups_display not found, add at end
                display_fields.append("ai_features_display")

        return tuple(display_fields)

    def get_fieldsets(
        self, request: HttpRequest, obj: Feed | None = None
    ) -> list[tuple[str | None, dict]]:
        """Get fieldsets, adding dynamic aggregator options and AI fields if enabled."""
        fieldsets = list(super().get_fieldsets(request, obj))

        insert_position = 1  # After Feed Information

        # Check if this feed has aggregator options
        if obj and obj.pk:
            aggregator_path = obj.aggregator
            if aggregator_path:
                try:
                    aggregator_class = get_aggregator_class(aggregator_path)
                    option_definitions = aggregator_class().options
                except Exception:
                    option_definitions = {}
                if option_definitions:
                    # Get the option field names
                    from aggregators.base import OptionsSchema

                    schema = OptionsSchema.from_dict(option_definitions)
                    option_field_names = tuple(
                        f"option_{key}" for key in schema.options
                    )

                    # Insert Aggregator Options fieldset after Feed Information
                    aggregator_options_fieldset = (
                        "Aggregator Options",
                        {
                            "fields": option_field_names,
                            "description": "Configuration options for this feed's aggregator.",
                        },
                    )
                    fieldsets.insert(insert_position, aggregator_options_fieldset)
                    insert_position += 1

        # Add AI features fieldset if AI is enabled
        if settings.AI_ENABLED:
            ai_fieldset = (
                "AI Features",
                {
                    "fields": (
                        "ai_translate_to",
                        "ai_summarize",
                        "ai_custom_prompt",
                    ),
                    "classes": ("collapse",),
                    "description": (
                        "AI-powered content processing. "
                        "Leave fields empty to disable. "
                        "Order: Translation → Summarization → Custom Prompt."
                    ),
                },
            )
            fieldsets.insert(insert_position, ai_fieldset)

        return fieldsets

    def get_urls(self) -> list[URLPattern]:
        """Add custom URLs for aggregator selection and feed creation."""
        urls = super().get_urls()
        custom_urls = [
            path(
                "select-aggregator/",
                self.admin_site.admin_view(select_aggregator_view),
                name="core_feed_select_aggregator",
            ),
            path(
                "create-from-aggregator/<str:module_name>/",
                self.admin_site.admin_view(create_feed_from_aggregator),
                name="core_feed_create_from_aggregator",
            ),
        ]
        return custom_urls + urls

    def add_view(
        self,
        request: HttpRequest,
        form_url: str = "",
        extra_context: dict | None = None,
    ) -> HttpResponse:
        """Override add view to redirect to aggregator selection."""
        return redirect("admin:core_feed_select_aggregator")

    def user_display(self, obj: Feed) -> str:
        """Display user ownership with visual indicator for shared feeds."""
        if obj.user:
            return obj.user.username
        return format_html(
            '<span style="color: #2196F3; font-weight: bold;">🌐 Shared</span>'
        )

    user_display.short_description = "Owner"  # type: ignore

    def aggregator_display(self, obj: Feed) -> str:
        """Display aggregator name with type badge."""
        aggregator_info = get_aggregator_info(obj.aggregator)

        # Set badge color based on type
        if aggregator_info["type"] == "broken":
            badge_color = "#f44336"  # Red for broken
        elif aggregator_info["type"] == "managed":
            badge_color = "#4CAF50"  # Green for managed
        else:
            badge_color = "#2196F3"  # Blue for custom

        return format_html(
            '<span style="background: {}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: bold; text-transform: uppercase; margin-right: 5px;">{}</span> {}',
            badge_color,
            aggregator_info["type"],
            aggregator_info["name"],
        )

    aggregator_display.short_description = "Aggregator"  # type: ignore

    def groups_display(self, obj: Feed) -> str:
        """Display groups this feed belongs to."""
        groups = obj.groups.all()
        if groups:
            group_names = ", ".join(group.name for group in groups)
            return format_html('<span style="color: #666;">{}</span>', group_names)
        return format_html('<span style="color: #999;">-</span>')

    groups_display.short_description = "Groups"  # type: ignore

    def ai_features_display(self, obj: Feed) -> str:
        """Display AI features as icons."""
        features = []
        if obj.ai_translate_to:
            features.append(f"🌍 {obj.ai_translate_to.upper()}")
        if obj.ai_summarize:
            features.append("📝 Sum")
        if obj.ai_custom_prompt:
            features.append("✨ Custom")

        if features:
            return format_html(
                '<span style="color: #9C27B0;">{}</span>', " ".join(features)
            )
        return format_html('<span style="color: #999;">-</span>')

    ai_features_display.short_description = "AI Features"  # type: ignore

    def aggregator_info_display(self, obj: Feed) -> str:
        """Display detailed aggregator information."""
        aggregator_info = get_aggregator_info(obj.aggregator)

        if aggregator_info["type"] == "broken":
            # Show warning for broken aggregators
            return format_html(
                '<div style="padding: 10px; background: #ffebee; border-left: 4px solid #f44336;">'
                '<strong style="color: #c62828;">⚠ Broken Aggregator</strong><br>'
                "<strong>ID:</strong> {}<br>"
                "<strong>Status:</strong> Not found in registry<br>"
                "<strong>Info:</strong> {}"
                "</div>",
                obj.aggregator,
                aggregator_info["description"],
            )

        # Normal aggregator info
        info_parts = [
            f"<strong>Name:</strong> {aggregator_info['name']}",
            f"<strong>Type:</strong> {aggregator_info['type'].title()}",
            f"<strong>ID:</strong> {obj.aggregator}",
        ]
        if aggregator_info.get("description"):
            info_parts.append(
                f"<strong>Description:</strong> {aggregator_info['description']}"
            )
        if aggregator_info.get("url"):
            label = aggregator_info.get("identifier_label", "Feed URL")
            info_parts.append(f"<strong>{label}:</strong> {aggregator_info['url']}")

        return format_html("<br>".join(info_parts))

    aggregator_info_display.short_description = "Aggregator Details"  # type: ignore

    def article_count(self, obj: Feed) -> int:
        """Return the number of articles for this feed."""
        return obj.articles.count()

    article_count.short_description = "Articles"  # type: ignore

    def feed_link(self, obj: Feed) -> str:
        """Return clickable links to the Yana RSS and HTML feed URLs."""
        if obj.pk:
            rss_url = f"/feeds/{obj.pk}/"
            html_url = f"/feeds/{obj.pk}/html"
            return format_html(
                '<a href="{}" target="_blank">RSS</a> | <a href="{}" target="_blank">HTML</a>',
                rss_url,
                html_url,
            )
        return "-"

    feed_link.short_description = "Feed Links"  # type: ignore

    @admin.action(description="Enable selected feeds")
    def enable_feeds(self, request: HttpRequest, queryset: QuerySet[Feed]) -> None:
        """
        Admin action to enable selected feeds.

        Args:
            request: The HTTP request
            queryset: The selected Feed objects
        """
        updated = queryset.update(enabled=True)
        self.message_user(request, f"Enabled {updated} feed(s).", messages.SUCCESS)

    @admin.action(description="Disable selected feeds")
    def disable_feeds(self, request: HttpRequest, queryset: QuerySet[Feed]) -> None:
        """
        Admin action to disable selected feeds.

        Args:
            request: The HTTP request
            queryset: The selected Feed objects
        """
        updated = queryset.update(enabled=False)
        self.message_user(request, f"Disabled {updated} feed(s).", messages.SUCCESS)

    @admin.action(description="Run aggregation for selected feeds")
    def run_aggregation(self, request: HttpRequest, queryset: QuerySet[Feed]) -> None:
        """
        Admin action to run aggregation for selected feeds.

        Args:
            request: The HTTP request
            queryset: The selected Feed objects
        """
        self._run_aggregation_impl(request, queryset, force_refresh=False)

    @admin.action(
        description="Force run aggregation for selected feeds (re-download all)"
    )
    def force_run_aggregation(
        self, request: HttpRequest, queryset: QuerySet[Feed]
    ) -> None:
        """
        Admin action to force run aggregation for selected feeds, re-downloading all content.

        Args:
            request: The HTTP request
            queryset: The selected Feed objects
        """
        self._run_aggregation_impl(request, queryset, force_refresh=True)

    def _run_aggregation_impl(
        self, request: HttpRequest, queryset: QuerySet[Feed], force_refresh: bool
    ) -> None:
        """
        Implementation for running aggregation on selected feeds.

        Args:
            request: The HTTP request
            queryset: The selected Feed objects
            force_refresh: Whether to force re-download of content
        """
        aggregation_service = AggregationService()
        total_new_articles = 0
        successful_feeds = 0
        failed_feeds = 0
        updated_examples = 0
        errors: list[tuple[str, str]] = []

        for feed in queryset:
            try:
                # Get aggregator options
                options = feed.get_aggregator_options()

                # Execute aggregation using service
                new_articles = aggregation_service.aggregate_feed(
                    feed, force_refresh, options
                )

                total_new_articles += new_articles
                successful_feeds += 1

                # Update feed example with the most recent article's content
                latest_article = feed.articles.order_by("-date").first()
                if latest_article:
                    feed.example = latest_article.content
                    feed.save(update_fields=["example", "updated_at"])
                    updated_examples += 1
                    logger.info(
                        f"Updated example for feed {feed.name} from article: {latest_article.name}"
                    )

                logger.info(
                    f"Successfully aggregated feed {feed.name}: {new_articles} new articles"
                )

            except Exception as e:
                failed_feeds += 1
                logger.error(f"Error aggregating feed {feed.name}: {e}", exc_info=True)
                errors.append((feed.name, str(e)))

        # Show summary message
        action_type = "force aggregated" if force_refresh else "aggregated"
        if successful_feeds > 0:
            message = (
                f"Successfully {action_type} {successful_feeds} feed(s). "
                f"Total new articles: {total_new_articles}"
            )
            if force_refresh and updated_examples > 0:
                message += f". Updated {updated_examples} feed example(s)"
            self.message_user(request, message, messages.SUCCESS)

        for feed_name, error_msg in errors:
            self.message_user(
                request,
                f"Error aggregating feed '{feed_name}': {error_msg}",
                messages.ERROR,
            )

        if failed_feeds > 0:
            self.message_user(
                request,
                f"Failed to aggregate {failed_feeds} feed(s). Check logs for details.",
                messages.WARNING,
            )


@admin.register(Article)
class ArticleAdmin(DjangoQLSearchMixin, admin.ModelAdmin):
    """Admin interface for Article model."""

    # Base list_display - AI column added dynamically in get_list_display()
    list_display = (
        "name",
        "feed",
        "date",
        "thumbnail_display",
        "url_link",
        "created_at",
    )
    list_filter = ("feed", "date", "created_at")
    search_fields = ("name", "url", "content")
    readonly_fields = (
        "created_at",
        "updated_at",
        "url_link",
        "thumbnail_display",
        "ai_processed",
        "ai_error",
    )
    date_hierarchy = "date"
    # Optimize list view by prefetching feed
    list_select_related = ("feed",)
    actions = ["mark_as_read", "mark_as_unread", "mark_as_starred", "mark_as_unstarred"]

    def get_list_display(self, request: HttpRequest) -> tuple[str, ...]:
        """Conditionally add AI status column if AI is enabled."""
        display_fields = list(super().get_list_display(request))

        # Add AI status after date if AI is enabled
        if settings.AI_ENABLED:
            try:
                idx = display_fields.index("date")
                display_fields.insert(idx + 1, "ai_status_display")
            except ValueError:
                display_fields.append("ai_status_display")

        return tuple(display_fields)

    def get_list_filter(self, request: HttpRequest) -> tuple[str, ...]:
        """Conditionally add AI filter if AI is enabled."""
        filters = list(super().get_list_filter(request))

        # Add ai_processed filter if AI is enabled
        if settings.AI_ENABLED and "ai_processed" not in filters:
            filters.insert(1, "ai_processed")

        return tuple(filters)

    def get_queryset(self, request: HttpRequest) -> QuerySet[Article]:
        """
        Filter articles based on feed ownership.

        - Superusers see all articles
        - Regular users see articles from their own feeds + shared feeds (user=NULL)
        """
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(Q(feed__user=request.user) | Q(feed__user__isnull=True))

    def get_fieldsets(
        self, request: HttpRequest, obj: Article | None = None
    ) -> list[tuple[str | None, dict]]:
        """Get fieldsets, conditionally adding AI metadata if AI is enabled."""
        fieldsets = [
            (
                "Article Information",
                {
                    "fields": (
                        "feed",
                        "name",
                        "url",
                        "url_link",
                        "date",
                        "thumbnail_url",
                        "thumbnail_display",
                    )
                },
            ),
            (
                "Content",
                {
                    "fields": ("content",),
                },
            ),
        ]

        # Add AI metadata section if AI is enabled
        if settings.AI_ENABLED:
            fieldsets.append(
                (
                    "AI Processing",
                    {
                        "fields": ("ai_processed", "ai_error"),
                        "classes": ("collapse",),
                    },
                )
            )

        # Always add metadata at the end
        fieldsets.append(
            (
                "Metadata",
                {"fields": ("created_at", "updated_at"), "classes": ("collapse",)},
            )
        )

        return fieldsets

    def url_link(self, obj: Article) -> str:
        """Return a clickable link to the original article."""
        if obj.url:
            return format_html('<a href="{}" target="_blank">{}</a>', obj.url, obj.url)
        return "-"

    url_link.short_description = "Article Link"  # type: ignore

    def thumbnail_display(self, obj: Article) -> str:
        """Display thumbnail image if available."""
        if obj.thumbnail_url:
            return format_html(
                '<a href="{}" target="_blank"><img src="{}" alt="Thumbnail" style="max-width: 100px; max-height: 100px; object-fit: contain;" /></a>',
                obj.thumbnail_url,
                obj.thumbnail_url,
            )
        return "-"

    thumbnail_display.short_description = "Thumbnail"  # type: ignore

    def ai_status_display(self, obj: Article) -> str:
        """Display AI processing status."""
        if obj.ai_error:
            return format_html(
                '<span style="color: #f44336;">❌ {}</span>', obj.ai_error
            )
        elif obj.ai_processed:
            return format_html('<span style="color: #4CAF50;">✅ Processed</span>')
        else:
            return format_html('<span style="color: #999;">-</span>')

    ai_status_display.short_description = "AI Status"  # type: ignore

    @admin.action(description="Mark selected articles as read")
    def mark_as_read(self, request: HttpRequest, queryset: QuerySet[Article]) -> None:
        """
        Admin action to mark selected articles as read for the current user.

        Args:
            request: The HTTP request
            queryset: The selected Article objects
        """
        from api.models import UserArticleState

        updated = 0
        for article in queryset:
            state, created = UserArticleState.objects.get_or_create(
                user=request.user,
                article=article,
                defaults={"is_read": True},
            )
            if not created and not state.is_read:
                state.is_read = True
                state.save(update_fields=["is_read", "updated_at"])
                updated += 1
            elif created:
                updated += 1

        self.message_user(
            request, f"Marked {updated} article(s) as read.", messages.SUCCESS
        )

    @admin.action(description="Mark selected articles as unread")
    def mark_as_unread(self, request: HttpRequest, queryset: QuerySet[Article]) -> None:
        """
        Admin action to mark selected articles as unread for the current user.

        Args:
            request: The HTTP request
            queryset: The selected Article objects
        """
        from api.models import UserArticleState

        updated = 0
        for article in queryset:
            state, created = UserArticleState.objects.get_or_create(
                user=request.user,
                article=article,
                defaults={"is_read": False},
            )
            if not created and state.is_read:
                state.is_read = False
                state.save(update_fields=["is_read", "updated_at"])
                updated += 1

        self.message_user(
            request, f"Marked {updated} article(s) as unread.", messages.SUCCESS
        )

    @admin.action(description="Star selected articles")
    def mark_as_starred(
        self, request: HttpRequest, queryset: QuerySet[Article]
    ) -> None:
        """
        Admin action to star selected articles for the current user.

        Args:
            request: The HTTP request
            queryset: The selected Article objects
        """
        from api.models import UserArticleState

        updated = 0
        for article in queryset:
            state, created = UserArticleState.objects.get_or_create(
                user=request.user,
                article=article,
                defaults={"is_saved": True},
            )
            if not created and not state.is_saved:
                state.is_saved = True
                state.save(update_fields=["is_saved", "updated_at"])
                updated += 1
            elif created:
                updated += 1

        self.message_user(request, f"Starred {updated} article(s).", messages.SUCCESS)

    @admin.action(description="Unstar selected articles")
    def mark_as_unstarred(
        self, request: HttpRequest, queryset: QuerySet[Article]
    ) -> None:
        """
        Admin action to unstar selected articles for the current user.

        Args:
            request: The HTTP request
            queryset: The selected Article objects
        """
        from api.models import UserArticleState

        updated = 0
        for article in queryset:
            state, created = UserArticleState.objects.get_or_create(
                user=request.user,
                article=article,
                defaults={"is_saved": False},
            )
            if not created and state.is_saved:
                state.is_saved = False
                state.save(update_fields=["is_saved", "updated_at"])
                updated += 1

        self.message_user(request, f"Unstarred {updated} article(s).", messages.SUCCESS)


@admin.register(UserAIQuota)
class UserAIQuotaAdmin(admin.ModelAdmin):
    """Admin interface for managing AI quotas."""

    list_display = [
        "user",
        "daily_used",
        "daily_limit",
        "monthly_used",
        "monthly_limit",
        "daily_reset_at",
        "monthly_reset_at",
    ]

    list_filter = ["daily_reset_at", "monthly_reset_at"]

    search_fields = ["user__username", "user__email"]

    readonly_fields = [
        "daily_used",
        "monthly_used",
        "daily_reset_at",
        "monthly_reset_at",
        "created_at",
        "updated_at",
    ]

    fieldsets = (
        ("User", {"fields": ("user",)}),
        ("Limits", {"fields": ("daily_limit", "monthly_limit")}),
        (
            "Usage",
            {
                "fields": (
                    "daily_used",
                    "monthly_used",
                    "daily_reset_at",
                    "monthly_reset_at",
                )
            },
        ),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )

    def has_module_permission(self, request: HttpRequest) -> bool:
        """Only show if AI is enabled."""
        return settings.AI_ENABLED
