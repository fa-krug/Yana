"""Google Reader API authentication decorators."""

import json
import logging
from functools import wraps

from django.http import HttpResponse, JsonResponse

from core.services.greader.auth_service import authenticate_request

logger = logging.getLogger(__name__)


def greader_auth_required(view_func):
    """Decorator requiring Google Reader API authentication.

    Extracts authentication from Authorization header or session.
    Attaches authenticated user info to request.greader_user.

    If authentication fails, returns 401 Unauthorized response
    in appropriate format (JSON or plain text).
    """

    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        # Get auth header and session user
        auth_header = request.headers.get("Authorization")
        session_user_id = request.session.get("_auth_user_id")

        # Attempt authentication
        user = authenticate_request(auth_header, session_user_id)

        if not user:
            logger.warning(
                f"Unauthorized access attempt to {request.path} from {request.remote_addr}"
            )

            # Return 401 in appropriate format
            if _expects_json(request):
                return JsonResponse({"error": "Unauthorized"}, status=401)
            else:
                return HttpResponse("Unauthorized", status=401, content_type="text/plain")

        # Attach user to request for use in view
        request.greader_user = user

        # Call the actual view
        return view_func(request, *args, **kwargs)

    return wrapper


def _expects_json(request) -> bool:
    """Check if request expects JSON response.

    Args:
        request: Django request object

    Returns:
        True if request expects JSON, False otherwise
    """
    accept_header = request.headers.get("Accept", "").lower()
    content_type = request.headers.get("Content-Type", "").lower()

    # Check Accept header
    if "application/json" in accept_header:
        return True

    # Check Content-Type for POST requests
    if "application/json" in content_type:
        return True

    # Check if specific endpoint expects JSON
    path = request.path.lower()
    json_endpoints = [
        "/user-info",
        "/subscription/list",
        "/tag/list",
        "/unread-count",
        "/stream/contents",
        "/stream/items/ids",
        "/stream/items/contents",
    ]

    for endpoint in json_endpoints:
        if endpoint in path:
            return True

    return False
