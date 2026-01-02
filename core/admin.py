from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User

from djangoql.admin import DjangoQLSearchMixin
from import_export.admin import ImportExportMixin, ImportExportModelAdmin

from .forms import FeedAdminForm
from .models import Article, Feed, FeedGroup, GReaderAuthToken, UserSettings
from .services import AggregatorService, ArticleService


@admin.register(FeedGroup)
class FeedGroupAdmin(ImportExportModelAdmin, DjangoQLSearchMixin):
    """Admin configuration for FeedGroup model."""

    list_display = ["name", "user", "created_at"]
    list_filter = ["user", "created_at"]
    search_fields = ["name", "user__username"]
    readonly_fields = ["created_at", "updated_at"]
    save_as = True
    list_select_related = ["user"]

    fieldsets = (
        (None, {"fields": ("name", "user")}),
        ("Timestamps", {"fields": ("created_at", "updated_at"), "classes": ("collapse",)}),
    )


@admin.register(Feed)
class FeedAdmin(ImportExportModelAdmin, DjangoQLSearchMixin):
    """Admin configuration for Feed model."""

    form = FeedAdminForm

    list_display = ["name", "aggregator", "enabled", "user", "group", "created_at"]
    list_filter = ["aggregator", "enabled", "user", "group", "created_at"]
    search_fields = ["name", "identifier", "user__username"]
    readonly_fields = ["created_at", "updated_at"]
    actions = ["aggregate_selected_feeds", "force_delete_selected"]
    save_as = True
    list_select_related = ["user", "group"]

    fieldsets = (
        (None, {"fields": ("name", "aggregator", "identifier", "enabled")}),
        ("Configuration", {"fields": ("daily_limit",)}),
        ("Relationships", {"fields": ("user", "group")}),
        ("Timestamps", {"fields": ("created_at", "updated_at"), "classes": ("collapse",)}),
    )

    def get_form(self, request, obj=None, **kwargs):
        """Pass request to form to allow conditional choices."""
        form_class = super().get_form(request, obj, **kwargs)

        class RequestForm(form_class):
            def __init__(self, *args, **kwargs):
                kwargs["request"] = request
                super().__init__(*args, **kwargs)

        return RequestForm

    @admin.action(description="Aggregate selected feeds")
    def aggregate_selected_feeds(self, request, queryset):
        """Admin action to aggregate selected feeds directly."""
        total_feeds = queryset.count()
        successful = 0
        failed = 0
        total_articles = 0

        for feed in queryset:
            try:
                result = AggregatorService.trigger_by_feed_id(feed.id)

                if result["success"]:
                    successful += 1
                    total_articles += result["articles_count"]
                    self.message_user(
                        request,
                        f"✓ Successfully aggregated '{result['feed_name']}': "
                        f"{result['articles_count']} articles",
                        messages.SUCCESS,
                    )
                else:
                    failed += 1
                    self.message_user(
                        request,
                        f"✗ Failed to aggregate '{result['feed_name']}': "
                        f"{result.get('error', 'Unknown error')}",
                        messages.ERROR,
                    )
            except Exception as e:
                failed += 1
                self.message_user(
                    request, f"✗ Error aggregating feed '{feed.name}': {str(e)}", messages.ERROR
                )

        # Summary message
        if successful > 0:
            self.message_user(
                request,
                f"Aggregation complete: {successful}/{total_feeds} feeds successful, "
                f"{total_articles} total articles aggregated",
                messages.SUCCESS if failed == 0 else messages.WARNING,
            )

        if failed == total_feeds:
            self.message_user(request, f"All {failed} feed(s) failed to aggregate", messages.ERROR)

    @admin.action(description="Force delete selected feeds")
    def force_delete_selected(self, request, queryset):
        """Force delete selected feeds without confirmation."""
        count = queryset.count()
        queryset.delete()
        self.message_user(request, f"Successfully deleted {count} feeds.", messages.SUCCESS)


@admin.register(Article)
class ArticleAdmin(ImportExportModelAdmin, DjangoQLSearchMixin):
    """Admin configuration for Article model."""

    list_display = ["name", "feed", "author", "date", "read", "starred", "created_at"]
    list_filter = ["feed", "read", "starred", "date", "created_at"]
    search_fields = ["name", "author", "identifier", "content"]
    readonly_fields = ["created_at", "updated_at"]
    actions = ["reload_selected_articles", "force_delete_selected"]
    save_as = True
    list_select_related = ["feed"]

    fieldsets = (
        (None, {"fields": ("name", "identifier", "feed")}),
        ("Content", {"fields": ("raw_content", "content")}),
        ("Metadata", {"fields": ("author", "icon", "date")}),
        ("Status", {"fields": ("read", "starred")}),
        ("Timestamps", {"fields": ("created_at", "updated_at"), "classes": ("collapse",)}),
    )

    @admin.action(description="Reload selected articles")
    def reload_selected_articles(self, request, queryset):
        """Admin action to reload selected articles directly."""
        total_articles = queryset.count()
        successful = 0
        failed = 0

        for article in queryset:
            try:
                result = ArticleService.reload_article(article.id)

                if result["success"]:
                    successful += 1
                    message = f"✓ Successfully reloaded '{result['article_name']}'"
                    if "message" in result:
                        message += f": {result['message']}"
                    self.message_user(request, message, messages.SUCCESS)
                else:
                    failed += 1
                    self.message_user(
                        request,
                        f"✗ Failed to reload '{result['article_name']}': "
                        f"{result.get('error', 'Unknown error')}",
                        messages.ERROR,
                    )
            except Exception as e:
                failed += 1
                self.message_user(
                    request, f"✗ Error reloading article '{article.name}': {str(e)}", messages.ERROR
                )

        # Summary message
        if successful > 0:
            self.message_user(
                request,
                f"Reload complete: {successful}/{total_articles} articles successful",
                messages.SUCCESS if failed == 0 else messages.WARNING,
            )

        if failed == total_articles:
            self.message_user(request, f"All {failed} article(s) failed to reload", messages.ERROR)

    @admin.action(description="Force delete selected articles")
    def force_delete_selected(self, request, queryset):
        """Force delete selected articles without confirmation."""
        count = queryset.count()
        queryset.delete()
        self.message_user(request, f"Successfully deleted {count} articles.", messages.SUCCESS)


class UserSettingsInline(admin.StackedInline):
    """Inline admin for UserSettings displayed in User admin."""

    model = UserSettings
    can_delete = False
    verbose_name = "API Settings"
    verbose_name_plural = "API Settings"
    fk_name = "user"

    fieldsets = (
        (
            "Reddit API",
            {
                "fields": (
                    "reddit_enabled",
                    "reddit_client_id",
                    "reddit_client_secret",
                    "reddit_user_agent",
                ),
                "classes": ("collapse",),
            },
        ),
        (
            "YouTube API",
            {"fields": ("youtube_enabled", "youtube_api_key"), "classes": ("collapse",)},
        ),
        (
            "OpenAI API",
            {
                "fields": (
                    "openai_enabled",
                    "openai_api_url",
                    "openai_api_key",
                    "ai_model",
                    "ai_temperature",
                    "ai_max_tokens",
                    "ai_default_daily_limit",
                    "ai_default_monthly_limit",
                    "ai_max_prompt_length",
                    "ai_request_timeout",
                    "ai_max_retries",
                    "ai_retry_delay",
                ),
                "classes": ("collapse",),
            },
        ),
    )


# Unregister the default User admin and register with inline
admin.site.unregister(User)


@admin.register(User)
class UserAdmin(ImportExportMixin, DjangoQLSearchMixin, BaseUserAdmin):
    """Custom User admin with UserSettings inline."""

    inlines = [UserSettingsInline]


@admin.register(UserSettings)
class UserSettingsAdmin(ImportExportModelAdmin, DjangoQLSearchMixin):
    """Standalone admin configuration for UserSettings model."""

    list_display = ["user", "reddit_enabled", "youtube_enabled", "openai_enabled", "updated_at"]
    list_filter = [
        "reddit_enabled",
        "youtube_enabled",
        "openai_enabled",
        "created_at",
        "updated_at",
    ]
    search_fields = ["user__username", "user__email"]
    readonly_fields = ["created_at", "updated_at"]
    list_select_related = ["user"]

    fieldsets = (
        (None, {"fields": ("user",)}),
        (
            "Reddit API",
            {
                "fields": (
                    "reddit_enabled",
                    "reddit_client_id",
                    "reddit_client_secret",
                    "reddit_user_agent",
                ),
                "classes": ("collapse",),
            },
        ),
        (
            "YouTube API",
            {"fields": ("youtube_enabled", "youtube_api_key"), "classes": ("collapse",)},
        ),
        (
            "OpenAI API",
            {
                "fields": (
                    "openai_enabled",
                    "openai_api_url",
                    "openai_api_key",
                    "ai_model",
                    "ai_temperature",
                    "ai_max_tokens",
                    "ai_default_daily_limit",
                    "ai_default_monthly_limit",
                    "ai_max_prompt_length",
                    "ai_request_timeout",
                    "ai_max_retries",
                    "ai_retry_delay",
                ),
                "classes": ("collapse",),
            },
        ),
        ("Timestamps", {"fields": ("created_at", "updated_at"), "classes": ("collapse",)}),
    )


@admin.register(GReaderAuthToken)
class GReaderAuthTokenAdmin(ImportExportModelAdmin, DjangoQLSearchMixin):
    """Admin configuration for GReaderAuthToken model."""

    list_display = ["user", "token", "expires_at", "created_at"]
    list_filter = ["user", "created_at", "expires_at"]
    search_fields = ["user__username", "token"]
    readonly_fields = ["created_at", "updated_at"]
    list_select_related = ["user"]

    fieldsets = (
        (None, {"fields": ("user", "token", "expires_at")}),
        ("Timestamps", {"fields": ("created_at", "updated_at"), "classes": ("collapse",)}),
    )
