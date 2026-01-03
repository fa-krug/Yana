"""Google Reader API preference views (stubs)."""

import logging

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from .decorators import greader_auth_required

logger = logging.getLogger(__name__)


@require_http_methods(["GET"])
@greader_auth_required
def preference_list(request):
    """List user preferences (stub).

    Response:
        JSON with empty prefs array
    """
    return JsonResponse({"prefs": []}, status=200)


@require_http_methods(["GET"])
@greader_auth_required
def preference_stream_list(request):
    """List stream preferences (stub).

    Response:
        JSON with empty streamprefs object
    """
    return JsonResponse({"streamprefs": {}}, status=200)
