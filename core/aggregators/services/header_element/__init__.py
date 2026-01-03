"""
Header element extraction service.

Provides functionality for extracting header elements (HTML iframes or base64 images)
from various sources using Strategy pattern.
"""

from .context import HeaderElementContext
from .extractor import HeaderElementExtractor

__all__ = ["HeaderElementExtractor", "HeaderElementContext"]
