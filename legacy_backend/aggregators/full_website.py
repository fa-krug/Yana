"""
Default aggregator for RSS feeds.

This module provides a generic aggregator that works with any standard RSS feed.
It fetches articles and stores their content without any site-specific processing.
"""

import re

from pydantic import BaseModel, Field

from .base import BaseAggregator, RawArticle


class DefaultAggregatorConfig(BaseModel):
    id: str
    type: str = Field(pattern="^(managed|custom|social)$")
    name: str = Field(min_length=1)
    url: str = ""
    description: str = Field(min_length=1)
    wait_for_selector: str | None = None
    selectors_to_remove: list[str] = Field(default_factory=list)
    options: dict = Field(default_factory=dict)


class DefaultAggregator(BaseAggregator):
    """
    Generic aggregator for any RSS feed.

    Fetches full article content from the web using Playwright, inlines images as base64,
    sanitizes HTML, and embeds YouTube videos. Works with most standard news sites and blogs.

    Supports configurable options:
    - exclude_selectors: Additional CSS selectors to remove from content
    - ignore_title_contains: Skip articles if title contains any of these strings
    - ignore_content_contains: Skip articles if content contains any of these strings
    - regex_replacements: List of regex replacements to apply to content
    """

    id = "full_website"
    type = "custom"
    name = "Full Article"
    url = ""
    description = "Generic aggregator for any RSS feed. Fetches full article content from the web using Playwright, inlines images as base64, sanitizes HTML, and embeds YouTube videos. Works with most standard news sites and blogs."

    options = {
        "exclude_selectors": {
            "type": "string",
            "label": "CSS selectors to exclude (one per line)",
            "help_text": "Additional CSS selectors for elements to remove from content. Enter one selector per line.\n\nExample:\n.advertisement\n.social-share\nfooter\nscript",
            "default": "",
            "widget": "textarea",
        },
        "ignore_title_contains": {
            "type": "string",
            "label": "Ignore articles if title contains (one per line)",
            "help_text": "Skip articles if the title contains any of these strings (case-insensitive). Enter one string per line.\n\nExample:\n[SPONSORED]\nAdvertisement\nPremium",
            "default": "",
            "widget": "textarea",
        },
        "ignore_content_contains": {
            "type": "string",
            "label": "Ignore articles if content contains (one per line)",
            "help_text": "Skip articles if the title or content contains any of these strings (case-insensitive). Enter one string per line.\n\nExample:\npaywall\nsubscription required\nmembers only",
            "default": "",
            "widget": "textarea",
        },
        "regex_replacements": {
            "type": "string",
            "label": "Regex replacements (one per line)",
            "help_text": "Apply regex replacements to article content. One replacement per line in format: pattern|replacement\n\nApplied sequentially after all other processing.\n\nExample:\nfoo|bar\n\\\\d{4}|YEAR\n^\\s+|  (remove leading spaces)\n\nNote: Use | to separate pattern from replacement. To include a literal |, escape it as \\|",
            "default": "",
            "widget": "textarea",
        },
    }

    def __init__(self):
        super().__init__()
        DefaultAggregatorConfig(
            id=self.id,
            type=self.type,
            name=self.name,
            url=self.url,
            description=self.description,
            wait_for_selector=self.wait_for_selector,
            selectors_to_remove=self.selectors_to_remove,
            options=self.options,
        )

    def should_skip_article(self, article: RawArticle) -> tuple[bool, str | None]:
        """
        Skip articles based on title or content contains filters.
        """
        # Check ignore_title_contains
        ignore_title = self.get_option("ignore_title_contains", "")
        if ignore_title:
            title_filters = [
                line.strip() for line in ignore_title.split("\n") if line.strip()
            ]
            for filter_term in title_filters:
                if filter_term.lower() in article.title.lower():
                    return (
                        True,
                        f"Skipping article with title containing '{filter_term}': {article.title}",
                    )

        # Check ignore_content_contains
        ignore_content = self.get_option("ignore_content_contains", "")
        if ignore_content:
            content_filters = [
                line.strip() for line in ignore_content.split("\n") if line.strip()
            ]
            # Check in both title and content
            search_text = f"{article.title} {article.content}".lower()
            for filter_term in content_filters:
                if filter_term.lower() in search_text:
                    return (
                        True,
                        f"Skipping article with content containing '{filter_term}': {article.title}",
                    )

        return super().should_skip_article(article)

    def remove_unwanted_elements(self, article: RawArticle) -> None:
        """
        Remove unwanted elements using both selectors_to_remove and exclude_selectors option.
        """
        from .utils import remove_elements_by_selectors

        # Get base selectors
        selectors = list(self.selectors_to_remove)

        # Add exclude_selectors from options
        exclude_selectors = self.get_option("exclude_selectors", "")
        if exclude_selectors:
            additional_selectors = [
                line.strip() for line in exclude_selectors.split("\n") if line.strip()
            ]
            selectors.extend(additional_selectors)

        # Remove elements by selectors (or just empty elements if no selectors)
        article.html = remove_elements_by_selectors(
            article.html,
            selectors if selectors else None,
            remove_empty=True,
        )

    def apply_regex_replacements(self, article: RawArticle) -> None:
        """
        Apply regex replacements to article content.

        Format: One replacement per line as: pattern|replacement
        """
        regex_replacements_text = self.get_option("regex_replacements", "")
        if not regex_replacements_text or not regex_replacements_text.strip():
            return

        lines = regex_replacements_text.strip().split("\n")
        for line_num, line in enumerate(lines, 1):
            line = line.strip()
            if not line or line.startswith("#"):  # Skip empty lines and comments
                continue

            # Split on | (but allow escaped \|)
            # Simple approach: split on | that's not preceded by \
            parts = []
            current_part = []
            i = 0
            while i < len(line):
                if line[i] == "\\" and i + 1 < len(line):
                    # Escape sequence
                    if line[i + 1] == "|":
                        current_part.append("|")
                        i += 2
                    else:
                        current_part.append(line[i])
                        current_part.append(line[i + 1])
                        i += 2
                elif line[i] == "|":
                    # Found delimiter
                    parts.append("".join(current_part))
                    current_part = []
                    i += 1
                else:
                    current_part.append(line[i])
                    i += 1

            parts.append("".join(current_part))

            if len(parts) < 2:
                self.logger.warning(
                    f"Invalid regex replacement format on line {line_num}: "
                    f"expected 'pattern|replacement', got: {line}"
                )
                continue

            pattern = parts[0].strip()
            replacement_str = "|".join(
                parts[1:]
            ).strip()  # Join back in case | was in replacement

            if not pattern:
                self.logger.warning(f"Empty pattern on line {line_num}, skipping")
                continue

            try:
                # Apply regex replacement
                article.html = re.sub(pattern, replacement_str, article.html)
                self.logger.debug(
                    f"Applied regex replacement: {pattern} -> {replacement_str}"
                )
            except re.error as e:
                self.logger.warning(
                    f"Invalid regex pattern '{pattern}' on line {line_num}: {e}, skipping"
                )
                continue
            except Exception as e:
                self.logger.warning(
                    f"Error applying regex replacement on line {line_num}: {e}, skipping"
                )
                continue

    def process_article(self, article: RawArticle, is_first: bool = False) -> str:
        """
        Process article with regex replacements applied after all processing.
        """
        # Call parent to do standard processing (fetch, extract, remove, sanitize, standardize, AI)
        super().process_article(article, is_first)

        # Apply regex replacements after all other processing
        self.apply_regex_replacements(article)

        return article.html


def aggregate(feed, force_refresh=False, options=None):
    aggregator = DefaultAggregator()
    return aggregator.aggregate(feed, force_refresh, options or {})
