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
        super().__init__(*args, **kwargs)

        # Make identifier help text more descriptive
        self.fields["identifier"].help_text = (
            "Select from predefined options or enter a custom identifier. "
            "For some aggregators, this is optional and will use a default if left blank."
        )

        # Update aggregator help text to indicate it affects identifier choices
        self.fields[
            "aggregator"
        ].help_text = "Select aggregator type. This determines available identifier choices."
