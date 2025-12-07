"""
Authentication utilities for Django Ninja API v1.

Provides decorators and utilities for handling authentication in API endpoints.
"""

from functools import wraps

from ninja.errors import HttpError


def login_required(func):
    """
    Decorator to require authentication for Django Ninja endpoints.

    Returns a 401 JSON error if user is not authenticated,
    instead of redirecting to a login page.

    Usage:
        @router.get("/endpoint")
        @login_required
        def my_endpoint(request):
            return {"data": "value"}
    """

    @wraps(func)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            raise HttpError(401, "Authentication required")
        return func(request, *args, **kwargs)

    return wrapper
