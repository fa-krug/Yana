"""Forms for the application."""

from django import forms

from .ai_client import AIClient
from .models import Feed, UserSettings


class UserSettingsAdminForm(forms.ModelForm):
    """Custom form for UserSettings admin with validation."""

    class Meta:
        model = UserSettings
        fields = "__all__"

    def clean(self):
        cleaned_data = super().clean()

        # Check OpenAI
        if cleaned_data.get("openai_enabled"):
            api_key = cleaned_data.get("openai_api_key")
            model = cleaned_data.get("openai_model")
            api_url = cleaned_data.get("openai_api_url")

            # Check if relevant fields changed or if it was just enabled
            if (
                "openai_enabled" in self.changed_data
                or "openai_api_key" in self.changed_data
                or "openai_model" in self.changed_data
                or "openai_api_url" in self.changed_data
            ):
                if not AIClient.verify_api_connection("openai", api_key, model, api_url):
                    self.add_error("openai_api_key", "Verification failed: Could not connect to OpenAI API.")

        # Check Anthropic
        if cleaned_data.get("anthropic_enabled"):
            api_key = cleaned_data.get("anthropic_api_key")
            model = cleaned_data.get("anthropic_model")

            if (
                "anthropic_enabled" in self.changed_data
                or "anthropic_api_key" in self.changed_data
                or "anthropic_model" in self.changed_data
            ):
                if not AIClient.verify_api_connection("anthropic", api_key, model):
                    self.add_error("anthropic_api_key", "Verification failed: Could not connect to Anthropic API.")

        # Check Gemini
        if cleaned_data.get("gemini_enabled"):
            api_key = cleaned_data.get("gemini_api_key")
            model = cleaned_data.get("gemini_model")

            if (
                "gemini_enabled" in self.changed_data
                or "gemini_api_key" in self.changed_data
                or "gemini_model" in self.changed_data
            ):
                if not AIClient.verify_api_connection("gemini", api_key, model):
                    self.add_error("gemini_api_key", "Verification failed: Could not connect to Gemini API.")

        return cleaned_data


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
