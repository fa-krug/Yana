"""
Base service class with common functionality.
"""

import logging
from typing import Any

from django.core.cache import cache
from django.db import transaction

logger = logging.getLogger(__name__)


class ServiceError(Exception):
    """Base exception for service errors."""

    pass


class NotFoundError(ServiceError):
    """Raised when a resource is not found."""

    pass


class PermissionDeniedError(ServiceError):
    """Raised when user doesn't have permission."""

    pass


class ValidationError(ServiceError):
    """Raised when validation fails."""

    pass


class BaseService:
    """
    Base service class with common functionality.

    All services should inherit from this class.
    """

    def __init__(self):
        """Initialize the service."""
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")

    @transaction.atomic
    def _atomic_operation(self, operation, *args, **kwargs):
        """
        Execute an operation within a database transaction.

        Args:
            operation: Callable to execute
            *args: Positional arguments for operation
            **kwargs: Keyword arguments for operation

        Returns:
            Result of operation
        """
        return operation(*args, **kwargs)

    def _cache_get(self, key: str, default: Any = None) -> Any:
        """
        Get value from cache.

        Args:
            key: Cache key
            default: Default value if key not found

        Returns:
            Cached value or default
        """
        return cache.get(key, default)

    def _cache_set(self, key: str, value: Any, timeout: int = 300) -> None:
        """
        Set value in cache.

        Args:
            key: Cache key
            value: Value to cache
            timeout: Cache timeout in seconds (default: 5 minutes)
        """
        cache.set(key, value, timeout)

    def _cache_delete(self, key: str) -> None:
        """
        Delete value from cache.

        Args:
            key: Cache key
        """
        cache.delete(key)

    def _cache_get_or_set(self, key: str, default: callable, timeout: int = 300) -> Any:
        """
        Get value from cache or set it using default function.

        Args:
            key: Cache key
            default: Callable that returns value if key not found
            timeout: Cache timeout in seconds (default: 5 minutes)

        Returns:
            Cached value or result of default()
        """
        return cache.get_or_set(key, default, timeout)
