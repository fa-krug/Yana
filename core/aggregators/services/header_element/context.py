"""
Header element extraction context.

Dataclass for passing context to header element extraction strategies.
"""

from dataclasses import dataclass


@dataclass
class HeaderElementContext:
    """Context for header element extraction strategies."""

    url: str  # Source URL
    alt: str  # Alt text for image/title for iframe
    user_id: int | None = None  # Optional user ID for authenticated API calls


@dataclass
class HeaderElementData:
    """Data returned from header element extraction strategies."""

    image_bytes: bytes  # Raw image data
    content_type: str  # MIME type (e.g., 'image/jpeg')
    base64_data_uri: str  # Base64 data URI for embedding in HTML
    image_url: str | None = None  # Original image URL for removal from content
