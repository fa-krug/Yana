"""Core application views."""

from .default import health_check, meta_view, youtube_proxy_view

__all__ = [
    "health_check",
    "meta_view",
    "youtube_proxy_view",
]
