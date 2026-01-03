"""Google Reader API tag views."""

import logging

from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from core.services.greader.stream_format import format_tag_list
from core.services.greader.tag_service import (
    TagError,
    edit_tags,
    list_tags,
)
from core.services.greader.tag_service import (
    mark_all_as_read as service_mark_all_as_read,
)

from .decorators import greader_auth_required

logger = logging.getLogger(__name__)


@require_http_methods(["GET"])
@greader_auth_required
def tag_list(request):
    """List all tags available for the authenticated user.

    Response (on success):
        JSON with array of tag IDs

    Response (on failure):
        401 Unauthorized
    """
    try:
        user_id = request.greader_user["id"]

        # Get tags
        tags = list_tags(user_id)

        response_data = format_tag_list(tags)

        return JsonResponse(response_data, status=200)

    except Exception:
        logger.exception("Error in tag_list view")
        return JsonResponse(
            {"error": "Internal server error"},
            status=500,
        )


@csrf_exempt
@require_http_methods(["POST"])
@greader_auth_required
def edit_tag(request):
    """Mark articles with tags (read/starred).

    POST parameters:
    - i: Item IDs (can be multiple, format: article ID or tag:google.com,2005:reader/item/ID)
    - a: Add tag (user/-/state/com.google/read or user/-/state/com.google/starred)
    - r: Remove tag

    Response (on success):
        "OK"

    Response (on failure):
        "Error message" (HTTP 400)
    """
    try:
        user_id = request.greader_user["id"]

        # Parse POST data
        body = request.POST

        # Get item IDs (might be multiple)
        item_ids = body.getlist("i")
        add_tag = body.get("a")
        remove_tag = body.get("r")

        if not item_ids:
            raise TagError("No item IDs provided")

        # Execute edit
        edit_tags(user_id, item_ids, add_tag, remove_tag)

        return HttpResponse("OK", status=200, content_type="text/plain")

    except TagError as e:
        logger.warning(f"Tag error: {e}")
        return HttpResponse(str(e), status=400, content_type="text/plain")

    except Exception:
        logger.exception("Error in edit_tag view")
        return HttpResponse(
            "Internal server error",
            status=500,
            content_type="text/plain",
        )


@csrf_exempt
@require_http_methods(["POST"])
@greader_auth_required
def mark_all_as_read(request):
    """Mark all articles in a stream as read.

    POST parameters:
    - s: Stream ID (feed/123, user/-/label/Name, user/-/state/com.google/reading-list, etc.)
    - ts: Timestamp (seconds) - optional, mark articles older than this

    Response (on success):
        "OK"

    Response (on failure):
        "Error message" (HTTP 400)
    """
    try:
        user_id = request.greader_user["id"]

        # Parse POST data
        body = request.POST

        stream_id = body.get("s")
        timestamp_str = body.get("ts")

        # Parse timestamp if provided
        timestamp = None
        if timestamp_str:
            try:
                timestamp = int(timestamp_str)
            except ValueError as e:
                raise TagError("Invalid timestamp format") from e

        # Execute mark all as read
        service_mark_all_as_read(user_id, stream_id, timestamp)

        return HttpResponse("OK", status=200, content_type="text/plain")

    except TagError as e:
        logger.warning(f"Tag error: {e}")
        return HttpResponse(str(e), status=400, content_type="text/plain")

    except Exception:
        logger.exception("Error in mark_all_as_read view")
        return HttpResponse(
            "Internal server error",
            status=500,
            content_type="text/plain",
        )


@csrf_exempt
@require_http_methods(["POST"])
@greader_auth_required
def disable_tag(request):
    """Disable a tag (stub).

    Response:
        "OK"
    """
    return HttpResponse("OK", status=200, content_type="text/plain")
