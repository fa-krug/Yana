"""
Forms for Django admin.
"""

from django import forms

from dal import autocomplete, forward

from .models import Feed


class FeedAdminForm(forms.ModelForm):
    """
    Custom admin form for Feed model with autocomplete support.

    Features:
    - Chained autocomplete for identifier based on aggregator selection
    - Allows custom identifier input beyond predefined choices
    """

    class Meta:
        model = Feed
        fields = [
            "name",
            "aggregator",
            "identifier",
            "daily_limit",
            "enabled",
            "user",
            "group",
        ]
        widgets = {
            "identifier": autocomplete.ListSelect2(
                url="feed-identifier-autocomplete",
                forward=[
                    forward.Field("aggregator", "aggregator"),
                ],
                attrs={
                    "data-placeholder": "Select or enter identifier...",
                    "data-allow-clear": "true",
                    "data-tags": "true",  # Allow custom input
                    "data-create-choice": "true",  # Create choice from custom input
                    "data-minimum-input-length": 0,  # Show choices immediately
                },
            ),
        }

    def __init__(self, *args, **kwargs):
        request = kwargs.pop("request", None)
        super().__init__(*args, **kwargs)

        if request:
            from .choices import AGGREGATOR_CHOICES
            from .models import UserSettings

            # Check enabled aggregators for current user
            reddit_enabled = False
            youtube_enabled = False
            try:
                if request.user and request.user.is_authenticated:
                    settings, _ = UserSettings.objects.get_or_create(user=request.user)
                    reddit_enabled = settings.reddit_enabled
                    youtube_enabled = settings.youtube_enabled
            except Exception:
                pass

            # Filter choices: hide reddit/youtube if disabled, unless already selected
            current_aggregator = (
                self.instance.aggregator if self.instance and self.instance.pk else None
            )

            filtered_choices = []
            for value, label in AGGREGATOR_CHOICES:
                if value == "reddit" and not reddit_enabled and current_aggregator != "reddit":
                    continue
                if value == "youtube" and not youtube_enabled and current_aggregator != "youtube":
                    continue
                filtered_choices.append((value, label))

            self.fields["aggregator"].choices = filtered_choices
        else:
            # Fallback if request is not available
            from .choices import AGGREGATOR_CHOICES

            self.fields["aggregator"].choices = AGGREGATOR_CHOICES

        # Make identifier help text more descriptive
        self.fields["identifier"].help_text = (
            "Select from predefined options or enter a custom identifier. "
            "For some aggregators, this is optional and will use a default if left blank."
        )

        # Update aggregator help text to indicate it affects identifier choices
        self.fields[
            "aggregator"
        ].help_text = "Select aggregator type. This determines available identifier choices."
