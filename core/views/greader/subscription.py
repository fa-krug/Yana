"""Google Reader API subscription views."""

import logging
from urllib.parse import parse_qs

from django.http import HttpResponse, JsonResponse
from django.views.decorators.http import require_http_methods

from core.services.greader.subscription_service import (
    PermissionDenied,
    SubscriptionError,
    edit_subscription,
    list_subscriptions,
)

from .decorators import greader_auth_required

logger = logging.getLogger(__name__)


@require_http_methods(["GET"])
@greader_auth_required
def subscription_list(request):
    """List all subscriptions for the authenticated user.

    Response (on success):
        JSON with array of subscriptions

    Response (on failure):
        401 Unauthorized
    """
    try:
        user_id = request.greader_user["id"]

        # Get subscriptions
        subscriptions = list_subscriptions(user_id)

        response_data = {
            "subscriptions": subscriptions,
        }

        return JsonResponse(response_data, status=200)

    except Exception as e:
        logger.exception("Error in subscription_list view")
        return JsonResponse(
            {"error": "Internal server error"},
            status=500,
        )


@require_http_methods(["POST"])
@greader_auth_required
def subscription_edit(request):
    """Edit a subscription (add, remove, rename, manage labels).

    POST parameters:
    - s: Stream ID (feed/123)
    - ac: Action (subscribe, unsubscribe, edit)
    - t: Title (for rename)
    - a: Add labels (user/-/label/LabelName)
    - r: Remove labels (user/-/label/LabelName)

    Response (on success):
        "OK"

    Response (on failure):
        "Error message" (HTTP 400 or 403)
    """
    try:
        user_id = request.greader_user["id"]

        # Parse POST data
        body = request.POST

        # Collect parameters
        options = {
            "s": body.get("s", ""),
            "ac": body.get("ac", ""),
            "t": body.get("t", ""),
        }

        # Handle add labels (might be multiple)
        add_labels = body.getlist("a")
        if add_labels:
            options["a"] = add_labels

        # Handle remove labels (might be multiple)
        remove_labels = body.getlist("r")
        if remove_labels:
            options["r"] = remove_labels

        # Execute edit
        result = edit_subscription(user_id, options)

        return HttpResponse("OK", status=200, content_type="text/plain")

    except SubscriptionError as e:
        logger.warning(f"Subscription error: {e}")
        return HttpResponse(str(e), status=400, content_type="text/plain")

    except PermissionDenied as e:
        logger.warning(f"Permission denied: {e}")
        return HttpResponse(str(e), status=403, content_type="text/plain")

    except Exception as e:
        logger.exception("Error in subscription_edit view")
        return HttpResponse(
            "Internal server error",
            status=500,
            content_type="text/plain",
        )
