"""
Header element extraction service.

Provides functionality for extracting header elements (HTML iframes or base64 images)
from various sources using Strategy pattern.
"""

from .extractor import HeaderElementExtractor
from .context import HeaderElementContext

__all__ = ["HeaderElementExtractor", "HeaderElementContext"]
