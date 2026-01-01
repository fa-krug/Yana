"""Google Reader API stream views."""

import contextlib
import logging

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from core.services.greader.stream_service import (
    StreamError,
    get_stream_contents,
    get_stream_item_ids,
    get_unread_count,
)

from .decorators import greader_auth_required

logger = logging.getLogger(__name__)


@require_http_methods(["GET"])
@greader_auth_required
def unread_count(request):
    """Get unread article counts per feed.

    Query parameters:
    - all: If '1', include feeds with 0 unread

    Response (on success):
        JSON with max and unreadcounts array

    Response (on failure):
        401 Unauthorized
    """
    try:
        user_id = request.greader_user["id"]

        # Parse query parameters
        include_all = request.GET.get("all") == "1"

        # Get counts
        result = get_unread_count(user_id, include_all)

        return JsonResponse(result, status=200)

    except Exception:
        logger.exception("Error in unread_count view")
        return JsonResponse(
            {"error": "Internal server error"},
            status=500,
        )


@require_http_methods(["GET"])
@greader_auth_required
def stream_items_ids(request):
    """Get article IDs from a stream (for syncing).

    Query parameters:
    - s: Stream ID
    - n: Limit (default 20, max 10000)
    - ot: Older than (timestamp)
    - xt: Exclude tag (typically read)
    - it: Include tag (typically starred)
    - r: Reverse (o = oldest first)

    Response (on success):
        JSON with itemRefs array

    Response (on failure):
        401 Unauthorized
    """
    try:
        user_id = request.greader_user["id"]

        # Parse query parameters
        stream_id = request.GET.get("s", "")
        limit = int(request.GET.get("n", 20))
        older_than_str = request.GET.get("ot")
        exclude_tag = request.GET.get("xt")
        include_tag = request.GET.get("it")
        reverse = request.GET.get("r") == "o"

        # Parse timestamp
        older_than = None
        if older_than_str:
            with contextlib.suppress(ValueError):
                older_than = int(older_than_str)

        # Get IDs
        result = get_stream_item_ids(
            user_id,
            stream_id=stream_id,
            limit=limit,
            older_than=older_than,
            exclude_tag=exclude_tag,
            include_tag=include_tag,
            reverse_order=reverse,
        )

        return JsonResponse(result, status=200)

    except StreamError as e:
        logger.warning(f"Stream error: {e}")
        return JsonResponse({"error": str(e)}, status=400)

    except Exception:
        logger.exception("Error in stream_items_ids view")
        return JsonResponse(
            {"error": "Internal server error"},
            status=500,
        )


@csrf_exempt
@require_http_methods(["GET", "POST"])
@greader_auth_required
def stream_contents(request, stream_id=None):
    """Get full article contents from a stream.

    Handles both GET and POST requests.
    Can accept stream_id in URL path or as parameter.

    Query/POST parameters:
    - s: Stream ID (can be in URL instead)
    - i: Specific item IDs (can be multiple)
    - n: Limit (default 50)
    - ot: Older than (timestamp)
    - xt: Exclude tag
    - it: Include tag
    - c: Continuation token

    Response (on success):
        JSON with items array and optional continuation

    Response (on failure):
        401 Unauthorized
    """
    try:
        user_id = request.greader_user["id"]

        # Get parameters from GET or POST
        params = request.GET if request.method == "GET" else request.POST

        # Get stream ID from URL path or parameters
        if stream_id:
            # Remove 'feed/' prefix if in URL
            if stream_id.startswith("feed/"):
                stream_id = stream_id
            query_stream_id = stream_id
        else:
            query_stream_id = params.get("s", "")

        # Get item IDs if provided
        item_ids = params.getlist("i")

        # Get other parameters
        limit = int(params.get("n", 50))
        older_than_str = params.get("ot")
        exclude_tag = params.get("xt")
        include_tag = params.get("it")
        continuation = params.get("c")

        # Parse timestamp
        older_than = None
        if older_than_str:
            with contextlib.suppress(ValueError):
                older_than = int(older_than_str)

        # Get contents
        result = get_stream_contents(
            user_id,
            request,
            stream_id=query_stream_id,
            item_ids=item_ids,
            limit=limit,
            older_than=older_than,
            exclude_tag=exclude_tag,
            include_tag=include_tag,
            continuation=continuation,
        )

        return JsonResponse(result, status=200)

    except StreamError as e:
        logger.warning(f"Stream error: {e}")
        return JsonResponse({"error": str(e)}, status=400)

    except Exception:
        logger.exception("Error in stream_contents view")
        return JsonResponse(
            {"error": "Internal server error"},
            status=500,
        )
