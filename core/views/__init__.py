"""Core application views."""

from .default import health_check, youtube_proxy_view

__all__ = [
    "health_check",
    "youtube_proxy_view",
]
