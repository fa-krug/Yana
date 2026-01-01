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
