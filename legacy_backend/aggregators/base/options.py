"""
Options and configuration management for aggregators.

This module provides the OptionsMixin class that handles aggregator configuration
including custom options, selector configuration, and timeout settings.
"""

from typing import Any


class OptionsMixin:
    """
    Mixin providing options and configuration management for aggregators.

    This mixin handles:
    - Custom aggregator options (options property)
    - CSS selectors for element removal (selectors_to_remove)
    - Playwright wait selectors (wait_for_selector)
    - Fetch timeout configuration (fetch_timeout)
    - Runtime option access (get_option method)
    - Identifier configuration for social aggregators
    """

    # ============================================================================
    # OPTIONAL CONFIGURATION - Can override in subclass
    # ============================================================================

    @property
    def options(self) -> dict[str, dict]:
        """
        Configuration schema (Pydantic-validated).

        Override to add custom options for this aggregator.

        Example:
            {
                "traverse_multipage": {
                    "type": "boolean",
                    "label": "Traverse multi-page articles",
                    "default": False,
                }
            }
        """
        return {}

    # ============================================================================
    # IDENTIFIER CONFIGURATION - Defines the primary input for each aggregator
    # ============================================================================

    @property
    def identifier_type(self) -> str:
        """
        Type of the identifier field.

        Options:
        - "url": A URL input (default for RSS-based aggregators)
        - "string": A plain text input (for social aggregators like subreddit names)

        Override in subclass to change the input type.
        """
        return "url"

    @property
    def identifier_label(self) -> str:
        """
        Label for the identifier input field.

        Override to provide a user-friendly label.
        Default: "Feed URL" for URL type, "Identifier" for string type.
        """
        if self.identifier_type == "url":
            return "Feed URL"
        return "Identifier"

    @property
    def identifier_description(self) -> str:
        """
        Help text/description for the identifier input field.

        Override to provide guidance for users.
        """
        if self.identifier_type == "url":
            return "Enter the RSS feed URL"
        return "Enter the identifier for this source"

    @property
    def identifier_placeholder(self) -> str:
        """
        Placeholder text for the identifier input field.

        Override to provide an example.
        """
        if self.identifier_type == "url":
            return "https://example.com/feed.xml"
        return ""

    @property
    def identifier_choices(self) -> list[tuple[str, str]] | None:
        """
        Choices for the identifier field (for dropdown/select).

        Override to provide a list of (value, label) tuples.
        If None, the identifier field will be a text input.
        If provided, the identifier field will be a choice field.

        Example:
            [("https://example.com/feed1.xml", "Feed 1"), ("https://example.com/feed2.xml", "Feed 2")]
        """
        return None

    @property
    def identifier_editable(self) -> bool:
        """
        Whether the identifier field can be edited after feed creation.

        Override to allow editing of the identifier field.
        Default: False (identifier is read-only after creation)
        True: Identifier can be edited (e.g., for Reddit subreddits, YouTube channels)

        Example:
            For Reddit aggregator, return True to allow changing the subreddit.
        """
        return False

    def validate_identifier(self, identifier: str) -> tuple[bool, str | None]:
        """
        Validate an identifier value.

        Override to add custom validation logic.

        Args:
            identifier: The user-provided identifier

        Returns:
            Tuple of (is_valid, error_message)
        """
        if not identifier or not identifier.strip():
            return False, f"{self.identifier_label} is required"
        return True, None

    def normalize_identifier(self, identifier: str) -> str:
        """
        Normalize an identifier value.

        Override to transform the identifier (e.g., strip whitespace, convert format).

        Args:
            identifier: The user-provided identifier

        Returns:
            The normalized identifier
        """
        return identifier.strip()

    @property
    def selectors_to_remove(self) -> list[str]:
        """
        CSS selectors for elements to remove from content.

        Override to specify unwanted elements (ads, social buttons, etc.)

        Example:
            [".ad", ".social-share", "script", "style"]
        """
        return []

    @property
    def wait_for_selector(self) -> str | None:
        """
        CSS selector to wait for when loading page with Playwright.

        Override to wait for specific elements before extraction.

        Example:
            ".article-content"
        """
        return None

    @property
    def fetch_timeout(self) -> int:
        """
        Playwright timeout in milliseconds.

        Override to change the default timeout.
        Checks runtime_options first, then returns default.

        Default: 30000 (30 seconds)
        """
        # Check runtime options first (allows per-aggregation override)
        if hasattr(self, "runtime_options") and "fetch_timeout" in self.runtime_options:
            return self.runtime_options["fetch_timeout"]
        return 30000

    # ============================================================================
    # RUNTIME OPTION ACCESS
    # ============================================================================

    def get_option(self, key: str, default: Any = None) -> Any:
        """
        Get an option value with fallback to default.

        Args:
            key: Option key name
            default: Default value if option not found

        Returns:
            Option value or default
        """
        return self.runtime_options.get(key, default)
