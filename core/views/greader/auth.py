"""Google Reader API authentication views."""

import logging

from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from core.services.greader.auth_service import (
    AuthenticationError,
    authenticate_with_credentials,
    generate_session_token,
)

from .decorators import greader_auth_required

logger = logging.getLogger(__name__)


@csrf_exempt
@require_http_methods(["POST"])
def client_login(request):
    """Handle Google Reader ClientLogin authentication.

    Accepts email and password via POST form data.
    Returns auth tokens in plain text format.

    Expected POST parameters:
    - Email or email: User email address
    - Passwd or passwd: User password

    Response (on success):
        SID=token\nLSID=\nAuth=token\n

    Response (on failure):
        Error=BadAuthentication\n (HTTP 403)
    """
    try:
        # Parse POST data
        body = request.POST

        email = body.get("Email") or body.get("email")
        password = body.get("Passwd") or body.get("passwd")

        if not email or not password:
            logger.warning("ClientLogin: Missing email or password")
            return HttpResponse(
                "Error=BadAuthentication\n",
                status=403,
                content_type="text/plain",
            )

        # Authenticate and create token
        result = authenticate_with_credentials(email, password)

        # Format response (Google Reader format)
        response_text = f"SID={result['Auth']}\nLSID=\nAuth={result['Auth']}\n"

        return HttpResponse(response_text, status=200, content_type="text/plain")

    except AuthenticationError as e:
        logger.info(f"ClientLogin authentication error: {e}")
        return HttpResponse(
            f"Error={str(e)}\n",
            status=403,
            content_type="text/plain",
        )

    except Exception:
        logger.exception("Error in ClientLogin")
        return HttpResponse(
            "Error=UnknownError\n",
            status=500,
            content_type="text/plain",
        )


@require_http_methods(["GET"])
@greader_auth_required
def token_view(request):
    """Return a session token for CSRF protection.

    Requires authentication via Authorization header or session.

    Response (on success):
        <57-character token string>

    Response (on failure):
        401 Unauthorized
    """
    try:
        user_id = request.greader_user["id"]

        # Generate short-lived session token
        session_token = generate_session_token(user_id)

        return HttpResponse(session_token, status=200, content_type="text/plain")

    except Exception:
        logger.exception("Error in token view")
        return HttpResponse(
            "Internal server error",
            status=500,
            content_type="text/plain",
        )


@require_http_methods(["GET"])
@greader_auth_required
def user_info(request):
    """Return authenticated user's information.

    Requires authentication via Authorization header or session.

    Response (on success):
        JSON with userId, userName, userProfileId, userEmail

    Response (on failure):
        401 Unauthorized
    """
    try:
        user = request.greader_user

        response_data = {
            "userId": str(user["id"]),
            "userName": user["username"],
            "userProfileId": str(user["id"]),  # Same as userId
            "userEmail": user["email"],
        }

        return JsonResponse(response_data, status=200)

    except Exception:
        logger.exception("Error in user_info view")
        return JsonResponse(
            {"error": "Internal server error"},
            status=500,
        )
