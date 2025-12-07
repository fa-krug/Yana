"""
Yana base aggregator framework.

This package provides the core infrastructure for building RSS feed aggregators:
- BaseAggregator: Abstract base class for all aggregators
- RawArticle: Type-safe data model for article content
- Utility functions for fetching, processing, and caching content
- Options validation and configuration management
"""

# External dependencies (needed for test mocking)
import requests  # noqa: F401

# Core classes
from .aggregator import BaseAggregator
from .daily_limit import DailyLimitMixin

# Fetching and caching
from .fetch import (
    _fetch_single_image,
    _get_browser,
    _return_browser,
    _url_cache,
    clear_cache,
    close_browser_pool,
    extract_image_from_url,
    fetch_article_content,
    fetch_feed,
    get_cache_stats,
)
from .models import (
    OptionDefinition,
    OptionsSchema,
    RawArticle,
    get_option_values_with_defaults,
    validate_aggregator_options,
    validate_option_values,
)

# Content processing and formatting
from .process import standardize_content_format
from .utils import extract_youtube_video_id, is_content_too_old, sanitize_html

__all__ = [
    # Core classes
    "BaseAggregator",
    "DailyLimitMixin",
    "RawArticle",
    "OptionDefinition",
    "OptionsSchema",
    # Validation functions
    "validate_aggregator_options",
    "validate_option_values",
    "get_option_values_with_defaults",
    # Fetching
    "fetch_feed",
    "fetch_article_content",
    "extract_image_from_url",
    "_fetch_single_image",
    "_get_browser",
    "_return_browser",
    "close_browser_pool",
    # Caching
    "_url_cache",
    "clear_cache",
    "get_cache_stats",
    # Content processing
    "sanitize_html",
    "extract_youtube_video_id",
    "is_content_too_old",
    "standardize_content_format",
]
