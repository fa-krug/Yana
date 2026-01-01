"""
Image extraction and compression service.

Provides functionality for:
- Extracting images from various sources (URLs, meta tags, pages)
- Compressing and encoding images
- HTTP image fetching with validation
"""

from .compression import compress_and_encode_image, compress_image, create_image_element
from .fetcher import fetch_single_image

__all__ = [
    "fetch_single_image",
    "compress_image",
    "compress_and_encode_image",
    "create_image_element",
]
