"""Forms for the application."""

import contextlib

from django import forms

from .models import Feed


class FeedAdminForm(forms.ModelForm):
    """Custom form for Feed admin."""

    class Meta:
        model = Feed
        fields = [
            "name",
            "aggregator",
            "identifier",
            "reddit_subreddit",
            "youtube_channel",
            "icon",
            "daily_limit",
            "enabled",
            "user",
            "group",
            "options",
        ]
        widgets = {
            "identifier": forms.TextInput(attrs={"class": "vTextField"}),
        }

    def __init__(self, *args, **kwargs):
        # The ModelAdmin passes 'request' to the form, but ModelForm doesn't expect it.
        # Remove it before calling super().__init__
        self.request = kwargs.pop("request", None)
        super().__init__(*args, **kwargs)
        # Set help text or other field attributes
        if "aggregator" in self.fields:
            self.fields[
                "aggregator"
            ].help_text = "Select aggregator type. This determines available identifier choices."

    def save(self, commit=True):
        """
        Save the feed and try to fetch the icon if missing or if identifier changed.
        """
        from .aggregators import get_aggregator

        instance = super().save(commit=False)

        # Normalize identifier if changed
        if "identifier" in self.changed_data:
            try:
                aggregator = get_aggregator(instance)
                instance.identifier = aggregator.normalize_identifier(instance.identifier)
            except Exception:
                pass

        # Always try to fetch the icon on save
        should_fetch_icon = True

        if commit:
            instance.save()
            self.save_m2m()

            # Trigger icon fetch if needed
            if should_fetch_icon:
                try:
                    from .aggregators import get_aggregator
                    from .aggregators.services.feed_icon.file_handler import FeedIconFileHandler
                    from .aggregators.services.image_extraction.fetcher import fetch_single_image

                    # We need a fully initialized instance for some aggregators
                    aggregator = get_aggregator(instance)

                    # Some aggregators might need validation to resolve URLs (like YouTube)
                    with contextlib.suppress(Exception):
                        aggregator.validate()

                    # Fetch source data to get metadata (like icon URL)
                    # We only need metadata, so we can use a small limit
                    with contextlib.suppress(Exception):
                        aggregator.fetch_source_data(limit=1)

                    feed_icon_url = aggregator.collect_feed_icon()
                    if feed_icon_url:
                        image_result = fetch_single_image(feed_icon_url)
                        if image_result:
                            FeedIconFileHandler.save_icon_to_feed(
                                instance, image_result["imageData"], image_result["contentType"]
                            )
                except Exception as e:
                    # Non-critical, just log it
                    import logging

                    logger = logging.getLogger(__name__)
                    logger.warning(f"Failed to fetch icon for feed {instance.id} on save: {e}")

        return instance
