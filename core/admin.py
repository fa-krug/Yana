"""Admin configuration for the application."""

from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User

from djangoql.admin import DjangoQLSearchMixin
from import_export.admin import ImportExportMixin, ImportExportModelAdmin

from .forms import FeedAdminForm
from .models import Article, Feed, FeedGroup, GReaderAuthToken, UserSettings
from .services import AggregatorService, ArticleService

# Customize Admin Site
admin.site.site_header = "Yana"
admin.site.site_title = "Yana Admin"
admin.site.index_title = "Welcome to Yana"


@admin.action(description="Clear raw article content for selected feeds")
def clear_raw_article_content(modeladmin, request, queryset):
    from .models import Article

    count = Article.objects.filter(feed__in=queryset).update(raw_content="")
    modeladmin.message_user(request, f"Cleared raw content for {count} articles.")


@admin.action(description="Delete all articles from selected feeds")
def delete_all_articles(modeladmin, request, queryset):
    from .models import Article

    count, _ = Article.objects.filter(feed__in=queryset).delete()
    modeladmin.message_user(request, f"Deleted {count} articles from selected feeds.")


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
class FeedAdmin(ImportExportModelAdmin, DjangoQLSearchMixin):
    """Admin configuration for Feed model."""

    form = FeedAdminForm

    list_display = ["name", "aggregator", "enabled", "user", "group", "icon", "created_at"]
    list_filter = ["aggregator", "enabled", "user", "group", "created_at"]
    search_fields = ["name", "identifier", "user__username"]
    readonly_fields = ["created_at", "updated_at"]
    actions = [
        "aggregate_selected_feeds",
        "force_delete_selected",
        "delete_all_articles",
        "clear_raw_article_content",
    ]
    save_as = True
    list_select_related = ["user", "group"]

    def get_fieldsets(self, request, obj=None):
        """Dynamic fieldsets: Simple for Add, Detailed for Edit."""
        if not obj:
            # Add View: Minimal fields
            return ((None, {"fields": ("name", "aggregator")}),)

        # Edit View: Full fields
        # Check if identifier should be hidden (fixed)
        fields = ["name", "aggregator_info", "identifier", "icon", "enabled"]

        # Determine if identifier is fixed/hidden
        # We can't easily check choices here without instantiating, but we can rely on standard field inclusion
        # and handle hiding in get_form or just keep it visible but readonly if needed.
        # User asked to hide it if fixed.

        return (
            (None, {"fields": fields}),
            ("Configuration", {"fields": ("daily_limit", "options")}),
            ("Relationships", {"fields": ("user", "group")}),
            ("Timestamps", {"fields": ("created_at", "updated_at"), "classes": ("collapse",)}),
        )

        def get_readonly_fields(self, request, obj=None):
            """Make aggregator readonly in edit view."""

            if obj:
                return ["aggregator_info", "created_at", "updated_at"]

            return ["created_at", "updated_at"]

        @admin.display(description="Aggregator Type")
        def aggregator_info(self, instance):
            """Display information about the selected aggregator."""

            if not instance.aggregator:
                return "-"

            try:
                from .aggregators.registry import AggregatorRegistry

                agg_class = AggregatorRegistry.get(instance.aggregator)

                doc = agg_class.__doc__ or ""

                # Return first line of docstring

                return doc.strip().split("\n")[0]

            except Exception:
                return "Unknown aggregator"

    def get_form(self, request, obj=None, **kwargs):
        """
        Pass request to form and dynamically adjust fields.
        - Add View: Only name/aggregator.
        - Edit View: Inject config fields and adjust identifier widget.
        """
        form_class = super().get_form(request, obj, **kwargs)

        class RequestForm(form_class):
            def __init__(self_form, *args, **kwargs):
                super().__init__(*args, **kwargs)

                # Handling for Edit View (obj exists)
                if obj and obj.aggregator:
                    # 1. Inject aggregator-specific configuration fields
                    try:
                        from django import forms

                        from .aggregators.registry import AggregatorRegistry

                        agg_class = AggregatorRegistry.get(obj.aggregator)
                        config_fields = agg_class.get_configuration_fields()

                        # Add config fields
                        for field_name, field in config_fields.items():
                            self_form.fields[field_name] = field
                            if obj.options and field_name in obj.options:
                                self_form.initial[field_name] = obj.options[field_name]

                        # 2. Adjust Identifier Widget
                        # Get available choices
                        choices = agg_class.get_identifier_choices(user=request.user)

                        if choices:
                            if len(choices) == 1:
                                # Fixed identifier: Hide the field and force value
                                self_form.fields["identifier"].widget = forms.HiddenInput()
                                self_form.initial["identifier"] = choices[0][0]
                                # Also update the instance to ensure it saves if not changed
                                # (HiddenInput values are posted, so this is fine)
                            else:
                                # Multiple choices: Use Select
                                self_form.fields["identifier"].widget = forms.Select(
                                    choices=choices
                                )
                        else:
                            # No predefined choices (e.g. YouTube search or generic website): Use Text
                            # If it was previously Hidden (from a fixed aggregator), make sure it's visible now
                            if isinstance(self_form.fields["identifier"].widget, forms.HiddenInput):
                                self_form.fields["identifier"].widget = forms.TextInput()

                    except Exception as e:
                        print(f"Error configuring form for aggregator: {e}")

        return RequestForm

    def save_model(self, request, obj, form, change):
        """Save aggregator-specific fields to options JSON."""
        if obj.aggregator:
            try:
                from .aggregators.registry import AggregatorRegistry

                agg_class = AggregatorRegistry.get(obj.aggregator)
                config_fields = agg_class.get_configuration_fields()

                # Extract values for config fields
                options = obj.options or {}
                for field_name in config_fields:
                    if field_name in form.cleaned_data:
                        options[field_name] = form.cleaned_data[field_name]

                obj.options = options
            except Exception as e:
                print(f"Error saving aggregator options: {e}")

        super().save_model(request, obj, form, change)

    def response_add(self, request, obj, post_url_continue=None):
        """
        Redirect to the change view after adding a new Feed.
        This allows the user to immediately see and configure the aggregator-specific options
        that appear only after the feed type is saved.
        """
        from django.http import HttpResponseRedirect
        from django.urls import reverse

        # If the user clicked "Save" (not "Save and add another" or "Save and continue editing")
        if "_save" in request.POST:
            opts = obj._meta
            change_url = reverse(
                f"admin:{opts.app_label}_{opts.model_name}_change",
                args=(obj.pk,),
                current_app=self.admin_site.name,
            )
            # Add a message to let the user know they can now configure options
            self.message_user(
                request,
                f'The feed "{obj}" was added successfully. You can now configure its specific options below.',
                messages.SUCCESS,
            )
            return HttpResponseRedirect(change_url)

        return super().response_add(request, obj, post_url_continue)

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
