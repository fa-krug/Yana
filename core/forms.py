"""Forms for the application."""

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
            "daily_limit",
            "enabled",
            "user",
            "group",
            "options",
        ]
        widgets = {
            "identifier": forms.TextInput(attrs={"class": "vTextField"}),
        }

    ai_summarize = forms.BooleanField(
        required=False, label="AI Summarize", help_text="Generate a summary of the article."
    )
    ai_improve_writing = forms.BooleanField(
        required=False,
        label="AI Improve Writing",
        help_text="Rewrite the article to improve clarity and style.",
    )
    ai_translate = forms.BooleanField(
        required=False,
        label="AI Translate",
        help_text="Translate the article to another language.",
    )
    ai_translate_language = forms.CharField(
        required=False,
        label="Target Language",
        help_text="Language to translate to (e.g., 'German', 'French', 'English').",
    )

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

        if commit:
            instance.save()
            self.save_m2m()

        return instance
