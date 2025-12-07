"""
Custom form for Feed admin with dynamic aggregator options.
"""

from typing import Any

from django import forms

from aggregators import get_aggregator_class, get_available_aggregators
from aggregators.base import OptionsSchema, validate_option_values

from .admin_views import get_aggregator_info
from .models import Feed


class FeedAdminForm(forms.ModelForm):
    """Custom form for Feed admin with different fields for managed vs custom feeds."""

    class Meta:
        model = Feed
        fields = "__all__"
        exclude = ["aggregator_options"]  # We'll handle this programmatically

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)

        # Get available aggregators and set as choices
        aggregator_choices = get_available_aggregators()
        self.fields["aggregator"].widget = forms.Select(choices=aggregator_choices)

        # Determine the aggregator to load options for
        aggregator_path = None
        if self.instance and self.instance.pk:
            # Editing existing feed
            aggregator_path = self.instance.aggregator
            aggregator_info = get_aggregator_info(aggregator_path)
            aggregator_type = aggregator_info.get("type")

            # Customize identifier field based on aggregator
            identifier_label = aggregator_info.get("identifier_label") or "Identifier"
            identifier_desc = aggregator_info.get("identifier_description") or ""
            identifier_placeholder = aggregator_info.get("identifier_placeholder") or ""
            identifier_editable = aggregator_info.get("identifier_editable", False)

            self.fields["identifier"].label = identifier_label
            self.fields["identifier"].help_text = identifier_desc

            # Check for identifier choices
            identifier_choices = aggregator_info.get("identifier_choices")
            if identifier_choices:
                self.fields["identifier"].widget = forms.Select()
                self.fields["identifier"].choices = identifier_choices
            elif identifier_placeholder:
                self.fields["identifier"].widget.attrs["placeholder"] = (
                    identifier_placeholder
                )

            # For managed feeds, make most fields read-only
            # Make identifier read-only if not editable according to aggregator config
            # Exception: if identifier_choices exists, allow editing to select from choices
            if aggregator_type == "managed":
                self.fields["name"].disabled = True
                if not identifier_editable and not identifier_choices:
                    self.fields["identifier"].disabled = True
                    self.fields[
                        "identifier"
                    ].help_text = f"{identifier_label} cannot be changed after creation"
                self.fields["icon"].disabled = True
                self.fields["name"].help_text = "Managed feed - name cannot be changed"
                self.fields[
                    "icon"
                ].help_text = "Managed feed - icon is fetched automatically"
            elif not identifier_editable and not identifier_choices:
                # For non-managed feeds, also respect identifier_editable
                self.fields["identifier"].disabled = True
                self.fields[
                    "identifier"
                ].help_text = f"{identifier_label} cannot be changed after creation"

            # Hide aggregator field for all feed types
            self.fields["aggregator"].widget = forms.HiddenInput()
            self.fields["aggregator"].required = False

        elif "aggregator" in self.initial:
            # Creating new feed from aggregator
            aggregator_path = self.initial.get("aggregator")

        # Load aggregator options and create dynamic fields
        if aggregator_path:
            try:
                aggregator_class = get_aggregator_class(aggregator_path)
                option_definitions = aggregator_class().options
                if option_definitions:
                    self._add_option_fields(option_definitions)
            except Exception:
                pass  # No options to add if aggregator can't be loaded

    def _add_option_fields(self, option_definitions: dict[str, dict]) -> None:
        """Dynamically add form fields for aggregator options."""
        schema = OptionsSchema.from_dict(option_definitions)
        existing_values = self.instance.aggregator_options if self.instance.pk else {}

        for key, definition in schema.options.items():
            field_name = f"option_{key}"
            # Get current value or default
            current_value = (
                existing_values.get(key)
                if key in existing_values
                else definition.default
            )

            # Create appropriate field based on type
            if definition.type == "boolean":
                field = forms.BooleanField(
                    label=definition.label,
                    help_text=definition.help_text,
                    required=False,
                    initial=current_value,
                )
            elif definition.type == "integer":
                field = forms.IntegerField(
                    label=definition.label,
                    help_text=definition.help_text,
                    required=definition.required,
                    initial=current_value,
                    min_value=definition.min,
                    max_value=definition.max,
                )
            elif definition.type == "float":
                field = forms.FloatField(
                    label=definition.label,
                    help_text=definition.help_text,
                    required=definition.required,
                    initial=current_value,
                    min_value=definition.min,
                    max_value=definition.max,
                )
            elif definition.type == "string":
                # Determine widget based on widget property or default to text
                widget_type = definition.widget or "text"
                if widget_type == "textarea":
                    widget = forms.Textarea(attrs={"rows": 5, "cols": 60})
                elif widget_type == "json":
                    widget = forms.Textarea(
                        attrs={
                            "rows": 10,
                            "cols": 60,
                            "style": "font-family: monospace;",
                        }
                    )
                else:
                    widget = forms.TextInput(attrs={"size": 60})
                field = forms.CharField(
                    label=definition.label,
                    help_text=definition.help_text,
                    required=definition.required,
                    initial=current_value,
                    widget=widget,
                )
            elif definition.type == "password":
                field = forms.CharField(
                    label=definition.label,
                    help_text=definition.help_text,
                    required=definition.required,
                    initial=current_value,
                    widget=forms.PasswordInput(attrs={"size": 60}),
                )
            elif definition.type == "choice":
                field = forms.ChoiceField(
                    label=definition.label,
                    help_text=definition.help_text,
                    required=definition.required,
                    initial=current_value,
                    choices=[("", "---------")] + (definition.choices or []),
                )
            else:
                continue

            self.fields[field_name] = field

    def clean(self) -> dict:
        """Collect option field values into aggregator_options."""
        cleaned_data = super().clean()

        # Collect all option_* fields into aggregator_options
        aggregator_options = {}
        option_fields = [k for k in self.fields if k.startswith("option_")]

        for field_name in option_fields:
            # Extract the option key (remove "option_" prefix)
            option_key = field_name[7:]  # len("option_") == 7
            value = cleaned_data.get(field_name)

            # For boolean fields, Django returns False for unchecked, we want False explicitly
            # For other fields, None means not provided
            if value is not None:
                aggregator_options[option_key] = value
            elif isinstance(self.fields[field_name], forms.BooleanField):
                aggregator_options[option_key] = False

        cleaned_data["aggregator_options"] = aggregator_options

        # Validate the collected options
        aggregator = cleaned_data.get("aggregator")
        if aggregator and aggregator_options:
            try:
                aggregator_class = get_aggregator_class(aggregator)
                option_definitions = aggregator_class().options
            except Exception:
                option_definitions = {}

            if option_definitions:
                is_valid, error_msg = validate_option_values(
                    option_definitions, aggregator_options
                )
                if not is_valid:
                    raise forms.ValidationError(f"Invalid options: {error_msg}")

        # For Reddit aggregator, check if subreddit exists
        if aggregator == "reddit":
            identifier = cleaned_data.get("identifier", "").strip()
            if identifier:
                try:
                    aggregator_class = get_aggregator_class("reddit")
                    aggregator_instance = aggregator_class()
                    # Normalize the identifier first
                    normalized = aggregator_instance.normalize_identifier(identifier)
                    # Check if subreddit exists
                    exists, error_msg = aggregator_instance.check_subreddit_exists(
                        normalized
                    )
                    if not exists and error_msg:
                        raise forms.ValidationError({"identifier": [error_msg]})
                except forms.ValidationError:
                    raise
                except Exception:
                    # If we can't check (e.g., credentials not configured), let it pass
                    # The error will be caught during actual aggregation
                    pass

        return cleaned_data

    def save(self, commit: bool = True) -> Feed:
        """Save the feed."""
        # Set aggregator_options on the instance before saving
        if "aggregator_options" in self.cleaned_data:
            self.instance.aggregator_options = self.cleaned_data["aggregator_options"]

        return super().save(commit=commit)
