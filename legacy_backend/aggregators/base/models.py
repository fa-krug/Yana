"""
Pydantic models for aggregator data structures.

This module defines the core data models used throughout the aggregation system:
- RawArticle: Article data from RSS feeds
- OptionDefinition: Schema for aggregator configuration options
- OptionsSchema: Complete configuration schema for an aggregator
"""

import logging
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, ValidationError, field_validator

logger = logging.getLogger(__name__)


# ============================================================================
# AGGREGATOR_OPTIONS Schema - Aggregator configuration system
# ============================================================================


class OptionDefinition(BaseModel):
    """
    Schema for defining a single aggregator option.

    Attributes:
        type: The data type of the option (boolean, integer, string, choice, float, password)
        label: Human-readable label for the option
        help_text: Detailed description of what the option does
        default: Default value for the option
        required: Whether this option is required (default: False)
        min: Minimum value for integer/float types (optional)
        max: Maximum value for integer/float types (optional)
        choices: List of valid choices for choice type (optional)
        widget: Widget type for rendering ("text", "textarea", "json") (optional)
    """

    type: str = Field(
        ..., description="Data type: boolean, integer, string, choice, float, password"
    )
    label: str = Field(..., description="Human-readable label")
    help_text: str = Field(default="", description="Detailed description")
    default: bool | int | str | float | None = Field(None, description="Default value")
    required: bool = Field(default=False, description="Whether option is required")
    min: int | float | None = Field(default=None, description="Minimum value")
    max: int | float | None = Field(default=None, description="Maximum value")
    choices: list[tuple[str, str]] | None = Field(
        default=None,
        description="Valid choices for choice type as (value, label) tuples",
    )
    widget: str | None = Field(
        default=None,
        description="Widget type: 'text' (default), 'textarea' (multiline), or 'json' (textarea with JSON validation)",
    )

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        """Validate that type is one of the supported types."""
        valid_types = {"boolean", "integer", "string", "choice", "float", "password"}
        if v not in valid_types:
            raise ValueError(
                f"Invalid type '{v}'. Must be one of: {', '.join(valid_types)}"
            )
        return v

    @field_validator("widget")
    @classmethod
    def validate_widget(cls, v: str | None) -> str | None:
        """Validate that widget is one of the supported widgets."""
        if v is None:
            return v
        valid_widgets = {"text", "textarea", "json"}
        if v not in valid_widgets:
            raise ValueError(
                f"Invalid widget '{v}'. Must be one of: {', '.join(valid_widgets)}"
            )
        return v

    @field_validator("default")
    @classmethod
    def validate_default(cls, v: Any, info) -> Any:
        """Validate that default value matches the type."""
        if v is None:
            return v

        option_type = info.data.get("type")

        if option_type == "boolean" and not isinstance(v, bool):
            raise ValueError(f"Default value for boolean must be bool, got {type(v)}")
        elif option_type == "integer" and not isinstance(v, int):
            raise ValueError(f"Default value for integer must be int, got {type(v)}")
        elif option_type in ("string", "password") and not isinstance(v, str):
            raise ValueError(f"Default value for string must be str, got {type(v)}")
        elif option_type == "float" and not isinstance(v, int | float):
            raise ValueError(f"Default value for float must be float, got {type(v)}")
        elif option_type == "choice" and not isinstance(v, str):
            raise ValueError(f"Default value for choice must be str, got {type(v)}")
            # Note: choices validation happens in model_validator

        return v

    def _get_choice_values(self) -> list[str]:
        """Extract choice values from choices list of (value, label) tuples."""
        if not self.choices:
            return []
        return [choice[0] for choice in self.choices]

    def model_post_init(self, __context: Any) -> None:
        """Validate choice type has choices defined and default is valid."""
        if self.type == "choice":
            if not self.choices or len(self.choices) == 0:
                raise ValueError("Choice type must have at least one choice defined")
            choice_values = self._get_choice_values()
            if self.default is not None and self.default not in choice_values:
                raise ValueError(
                    f"Default value '{self.default}' not in choices: {choice_values}"
                )

        # Validate min/max constraints on default value
        if self.default is not None and self.type in ("integer", "float"):
            if self.min is not None and self.default < self.min:
                raise ValueError(
                    f"Default value {self.default} is less than min {self.min}"
                )
            if self.max is not None and self.default > self.max:
                raise ValueError(
                    f"Default value {self.default} is greater than max {self.max}"
                )


class OptionsSchema(BaseModel):
    """
    Schema for the complete OPTIONS definition of an aggregator.

    This is a dictionary mapping option keys to their definitions.
    """

    options: dict[str, OptionDefinition] = Field(
        default_factory=dict, description="Map of option key to definition"
    )

    @classmethod
    def from_dict(cls, options_dict: dict[str, dict]) -> "OptionsSchema":
        """
        Create OptionsSchema from a plain dictionary.

        Args:
            options_dict: Dictionary mapping option keys to option definition dicts

        Returns:
            OptionsSchema instance

        Raises:
            ValidationError: If the schema is invalid
        """
        parsed_options = {}
        for key, definition in options_dict.items():
            parsed_options[key] = OptionDefinition(**definition)
        return cls(options=parsed_options)


def validate_aggregator_options(
    options_dict: dict[str, dict],
) -> tuple[bool, str | None]:
    """
    Validate an aggregator's AGGREGATOR_OPTIONS definition.

    Args:
        options_dict: The AGGREGATOR_OPTIONS dictionary from an aggregator module

    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        OptionsSchema.from_dict(options_dict)
        return (True, None)
    except ValidationError as e:
        error_msg = f"Invalid AGGREGATOR_OPTIONS schema: {e}"
        logger.error(error_msg)
        return (False, error_msg)
    except Exception as e:
        error_msg = f"Error validating AGGREGATOR_OPTIONS: {e}"
        logger.error(error_msg)
        return (False, error_msg)


def validate_option_values(
    option_definitions: dict[str, dict], values: dict[str, Any]
) -> tuple[bool, str | None]:
    """
    Validate runtime option values against their definitions.

    Args:
        option_definitions: The AGGREGATOR_OPTIONS dictionary from an aggregator module
        values: Dictionary of runtime values to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        # First validate the schema
        schema = OptionsSchema.from_dict(option_definitions)

        # Then validate each value
        for key, value in values.items():
            if key not in schema.options:
                return (False, f"Unknown option: {key}")

            definition = schema.options[key]

            # Check required
            if value is None:
                if definition.required:
                    return (False, f"Required option '{key}' is missing")
                continue

            # Type validation
            if definition.type == "boolean":
                if not isinstance(value, bool):
                    return (
                        False,
                        f"Option '{key}' must be boolean, got {type(value).__name__}",
                    )

            elif definition.type == "integer":
                if not isinstance(value, int):
                    return (
                        False,
                        f"Option '{key}' must be integer, got {type(value).__name__}",
                    )
                # Check min/max
                if definition.min is not None and value < definition.min:
                    return (
                        False,
                        f"Option '{key}' value {value} is less than min {definition.min}",
                    )
                if definition.max is not None and value > definition.max:
                    return (
                        False,
                        f"Option '{key}' value {value} is greater than max {definition.max}",
                    )

            elif definition.type == "float":
                if not isinstance(value, int | float):
                    return (
                        False,
                        f"Option '{key}' must be float, got {type(value).__name__}",
                    )
                # Check min/max
                if definition.min is not None and value < definition.min:
                    return (
                        False,
                        f"Option '{key}' value {value} is less than min {definition.min}",
                    )
                if definition.max is not None and value > definition.max:
                    return (
                        False,
                        f"Option '{key}' value {value} is greater than max {definition.max}",
                    )

            elif definition.type in ("string", "password"):
                if not isinstance(value, str):
                    return (
                        False,
                        f"Option '{key}' must be string, got {type(value).__name__}",
                    )

            elif definition.type == "choice":
                if not isinstance(value, str):
                    return (
                        False,
                        f"Option '{key}' must be string, got {type(value).__name__}",
                    )
                # Extract choice values (handles both strings and tuples)
                choice_values = definition._get_choice_values()
                if choice_values and value not in choice_values:
                    return (
                        False,
                        f"Option '{key}' value '{value}' not in valid choices: {choice_values}",
                    )

        return (True, None)

    except ValidationError as e:
        return (False, str(e))
    except Exception as e:
        return (False, f"Error validating option values: {e}")


def get_option_values_with_defaults(
    option_definitions: dict[str, dict], values: dict[str, Any] | None = None
) -> dict[str, Any]:
    """
    Get option values with defaults applied.

    Args:
        option_definitions: The AGGREGATOR_OPTIONS dictionary from an aggregator module
        values: Dictionary of runtime values (may be None or incomplete)

    Returns:
        Dictionary with all options filled in with values or defaults
    """
    if values is None:
        values = {}

    result = {}
    schema = OptionsSchema.from_dict(option_definitions)

    for key, definition in schema.options.items():
        if key in values and values[key] is not None:
            result[key] = values[key]
        else:
            result[key] = definition.default

    return result


# ============================================================================
# Article Data Model
# ============================================================================


class RawArticle(BaseModel):
    """
    Article data extracted from RSS feed before processing.

    This model provides type safety and validation for article data throughout
    the aggregation pipeline.
    """

    url: str = Field(..., description="Article URL")
    title: str = Field(..., description="Article title")
    date: datetime = Field(..., description="Publication date (timezone-aware)")
    content: str = Field(..., description="Raw RSS content")
    entry: Any = Field(..., description="Original feedparser entry object")
    html: str | None = Field(
        default=None, description="Processed HTML content (updated through pipeline)"
    )
    thumbnail_url: str | None = Field(
        default=None, description="Thumbnail image URL extracted during processing"
    )
    # AI processing metadata
    ai_processed: bool = Field(
        default=False, description="Whether AI processing was applied to this article"
    )
    ai_error: str = Field(
        default="", description="Short error message if AI processing failed"
    )

    model_config = {"arbitrary_types_allowed": True}
