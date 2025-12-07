"""
Google Reader API implementation for Yana.

This module implements the Google Reader API specification for compatibility
with RSS readers like Reeder, NewsFlash, etc.

API Reference: https://www.davd.io/posts/2025-02-05-reimplementing-google-reader-api-in-2025/
"""

import logging
from typing import Any

from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import render
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.clickjacking import xframe_options_exempt
from django.views.decorators.csrf import csrf_exempt

from core.services.base import ValidationError

from .services import (
    AuthService,
    StreamService,
    SubscriptionService,
    TagService,
    UserService,
)

logger = logging.getLogger(__name__)


def require_auth(view_func):
    """Decorator to require authentication for a view method."""

    def wrapper(self, request, *args, **kwargs):
        user = self._authenticate(request)
        if not user:
            return HttpResponse("Unauthorized", status=401, content_type="text/plain")
        self.user = user
        return view_func(self, request, *args, **kwargs)

    return wrapper


@method_decorator(csrf_exempt, name="dispatch")
class ClientLoginView(View):
    """
    Handle /accounts/ClientLogin for initial authentication.

    Returns auth token in text/plain format.
    """

    def post(self, request: HttpRequest) -> HttpResponse:
        """
        Authenticate user and return auth token.

        Expected POST parameters:
        - Email: username
        - Passwd: password
        """
        email = request.POST.get("Email", "")
        password = request.POST.get("Passwd", "")

        auth_service = AuthService()
        user, auth_token = auth_service.authenticate_with_credentials(
            email, password, request
        )

        if not user:
            return HttpResponse(
                "Error=BadAuthentication", status=401, content_type="text/plain"
            )

        # Return in expected format
        response_text = f"SID={auth_token.token}\nLSID=null\nAuth={auth_token.token}\n"

        return HttpResponse(response_text, content_type="text/plain")


@method_decorator(csrf_exempt, name="dispatch")
class GReaderApiView(View):
    """
    Main Google Reader API endpoint handler.

    All endpoints require authentication via Authorization header:
    Authorization: GoogleLogin auth={token}
    """

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.user = None
        self.auth_service = AuthService()

    def _authenticate(self, request: HttpRequest):
        """
        Authenticate the request using the Authorization header or Django session.

        Args:
            request: The HTTP request

        Returns:
            User object or None
        """
        return self.auth_service.authenticate_request(request)

    def _get_output_format(self, request: HttpRequest) -> str:
        """Get the requested output format (json or xml)."""
        return request.GET.get("output", request.POST.get("output", "json"))


@method_decorator(csrf_exempt, name="dispatch")
class TokenView(GReaderApiView):
    """Handle /reader/api/0/token endpoint."""

    @require_auth
    def get(self, request: HttpRequest) -> HttpResponse:
        """Return a short-lived session token."""
        token = self.auth_service.generate_session_token(self.user)
        return HttpResponse(token, content_type="text/plain")


@method_decorator(csrf_exempt, name="dispatch")
class UserInfoView(GReaderApiView):
    """Handle /reader/api/0/user-info endpoint."""

    @require_auth
    def get(self, request: HttpRequest) -> JsonResponse:
        """Return authenticated user metadata."""
        user_service = UserService()
        user_info = user_service.get_user_info(self.user)
        return JsonResponse(user_info)


@method_decorator(csrf_exempt, name="dispatch")
class SubscriptionListView(GReaderApiView):
    """Handle /reader/api/0/subscription/list endpoint."""

    @require_auth
    def get(self, request: HttpRequest) -> JsonResponse:
        """Return all feed subscriptions."""
        subscription_service = SubscriptionService()
        subscriptions = subscription_service.list_subscriptions(self.user)
        return JsonResponse({"subscriptions": subscriptions})


@method_decorator(csrf_exempt, name="dispatch")
class SubscriptionEditView(GReaderApiView):
    """Handle /reader/api/0/subscription/edit endpoint."""

    @require_auth
    def post(self, request: HttpRequest) -> HttpResponse:
        """Edit a subscription."""
        action = request.POST.get("ac", "edit")
        stream_id = request.POST.get("s", "")
        new_title = request.POST.get("t", "")
        add_label = request.POST.get("a", "")
        remove_label = request.POST.get("r", "")

        subscription_service = SubscriptionService()
        try:
            subscription_service.edit_subscription(
                user=self.user,
                stream_id=stream_id,
                action=action,
                new_title=new_title,
                add_label=add_label,
                remove_label=remove_label,
            )
            return HttpResponse("OK", content_type="text/plain")
        except ValidationError as e:
            return HttpResponse(str(e), status=400, content_type="text/plain")
        except Exception as e:
            # Handle NotFoundError and PermissionDeniedError
            if "not found" in str(e).lower():
                return HttpResponse(str(e), status=404, content_type="text/plain")
            elif "permission" in str(e).lower() or "cannot" in str(e).lower():
                return HttpResponse(str(e), status=403, content_type="text/plain")
            raise


@method_decorator(csrf_exempt, name="dispatch")
class TagListView(GReaderApiView):
    """Handle /reader/api/0/tag/list endpoint."""

    @require_auth
    def get(self, request: HttpRequest) -> JsonResponse:
        """Return available tags."""
        tag_service = TagService()
        tags = tag_service.list_tags(self.user)
        return JsonResponse({"tags": tags})


@method_decorator(csrf_exempt, name="dispatch")
class StreamContentsView(GReaderApiView):
    """Handle /reader/api/0/stream/contents/:streamId endpoint."""

    @require_auth
    def get(self, request: HttpRequest, stream_id: str = "") -> JsonResponse:
        """Fetch feed items from specified stream."""
        return self._handle_stream_contents(request, stream_id)

    @require_auth
    def post(self, request: HttpRequest, stream_id: str = "") -> JsonResponse:
        """Fetch feed items from specified stream (POST variant)."""
        return self._handle_stream_contents(request, stream_id)

    def _handle_stream_contents(
        self, request: HttpRequest, stream_id: str
    ) -> JsonResponse:
        """Process stream contents request."""
        # Parse parameters
        item_ids = request.GET.getlist("i") or request.POST.getlist("i")
        exclude_tag = request.GET.get("xt", request.POST.get("xt", ""))
        limit = int(request.GET.get("n", request.POST.get("n", 50)))
        older_than = request.GET.get("ot", request.POST.get("ot", ""))
        continuation = request.GET.get("c", request.POST.get("c", ""))

        stream_service = StreamService()
        response = stream_service.get_stream_contents(
            user=self.user,
            stream_id=stream_id,
            item_ids=item_ids,
            exclude_tag=exclude_tag,
            limit=limit,
            older_than=older_than,
            continuation=continuation,
        )

        return JsonResponse(response)


@method_decorator(csrf_exempt, name="dispatch")
class StreamItemIdsView(GReaderApiView):
    """Handle /reader/api/0/stream/items/ids endpoint."""

    @require_auth
    def get(self, request: HttpRequest) -> JsonResponse:
        """Return item IDs for a stream."""
        stream_id = request.GET.get("s", "user/-/state/com.google/reading-list")
        limit = min(int(request.GET.get("n", 1000)), 10000)
        older_than = request.GET.get("ot", "")
        exclude_tag = request.GET.get("xt", "")
        include_tag = request.GET.get("it", "")
        reverse_order = request.GET.get("r", "") == "o"

        stream_service = StreamService()
        response = stream_service.get_stream_item_ids(
            user=self.user,
            stream_id=stream_id,
            limit=limit,
            older_than=older_than,
            exclude_tag=exclude_tag,
            include_tag=include_tag,
            reverse_order=reverse_order,
        )

        return JsonResponse(response)


@method_decorator(csrf_exempt, name="dispatch")
class UnreadCountView(GReaderApiView):
    """Handle /reader/api/0/unread-count endpoint."""

    @require_auth
    def get(self, request: HttpRequest) -> JsonResponse:
        """Return unread counts per feed."""
        include_all = request.GET.get("all", "0") == "1"

        stream_service = StreamService()
        result = stream_service.get_unread_count(self.user, include_all)

        return JsonResponse(result)


@method_decorator(csrf_exempt, name="dispatch")
class EditTagView(GReaderApiView):
    """Handle /reader/api/0/edit-tag endpoint."""

    @require_auth
    def post(self, request: HttpRequest) -> HttpResponse:
        """Modify item tags (read/unread/starred/unstarred) for articles."""
        item_ids_raw = request.POST.getlist("i")
        add_tag = request.POST.get("a", "")
        remove_tag = request.POST.get("r", "")

        tag_service = TagService()
        tag_service.edit_tags(
            user=self.user,
            item_ids=item_ids_raw,
            add_tag=add_tag,
            remove_tag=remove_tag,
        )

        return HttpResponse("OK", content_type="text/plain")


@method_decorator(csrf_exempt, name="dispatch")
class MarkAllAsReadView(GReaderApiView):
    """Handle /reader/api/0/mark-all-as-read endpoint."""

    @require_auth
    def post(self, request: HttpRequest) -> HttpResponse:
        """Mark all items in a stream as read."""
        stream_id = request.POST.get("s", "")
        timestamp = request.POST.get("ts", "")

        tag_service = TagService()
        tag_service.mark_all_as_read(
            user=self.user,
            stream_id=stream_id,
            timestamp=timestamp,
        )

        return HttpResponse("OK", content_type="text/plain")


def ai_status_view(request: HttpRequest) -> JsonResponse:
    """
    Return AI feature availability status.

    Used by frontend to conditionally show/hide AI-related UI elements.
    """
    from django.conf import settings

    return JsonResponse(
        {
            "ai_enabled": settings.AI_ENABLED,
            "ai_model": settings.AI_MODEL if settings.AI_ENABLED else None,
        }
    )


@xframe_options_exempt
def youtube_proxy_view(request: HttpRequest) -> HttpResponse:
    """YouTube video proxy page."""
    return render(request, "api/youtube_proxy.html")
