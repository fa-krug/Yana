from django.contrib import admin, messages

from .models import Article, Feed, FeedGroup
from .services import AggregatorService, ArticleService


@admin.register(FeedGroup)
class FeedGroupAdmin(admin.ModelAdmin):
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
class FeedAdmin(admin.ModelAdmin):
    """Admin configuration for Feed model."""

    list_display = ["name", "aggregator", "enabled", "user", "group", "created_at"]
    list_filter = ["aggregator", "enabled", "user", "group", "created_at"]
    search_fields = ["name", "identifier", "user__username"]
    readonly_fields = ["created_at", "updated_at"]
    actions = ["aggregate_selected_feeds"]
    save_as = True
    list_select_related = ["user", "group"]

    fieldsets = (
        (None, {"fields": ("name", "aggregator", "identifier", "enabled")}),
        ("Configuration", {"fields": ("daily_limit", "icon")}),
        ("Relationships", {"fields": ("user", "group")}),
        ("Timestamps", {"fields": ("created_at", "updated_at"), "classes": ("collapse",)}),
    )

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


@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    """Admin configuration for Article model."""

    list_display = ["name", "feed", "author", "date", "read", "starred", "created_at"]
    list_filter = ["feed", "read", "starred", "date", "created_at"]
    search_fields = ["name", "author", "identifier", "content"]
    readonly_fields = ["created_at", "updated_at"]
    actions = ["reload_selected_articles"]
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
