"""
Authentication endpoints for API v1.

Provides user authentication status and user information.
Uses HTTP-only cookies with CSRF protection.
"""

from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from ninja import Router
from pydantic import BaseModel

router = Router()


# Response schemas
class UserSchema(BaseModel):
    """User information schema."""

    id: int
    username: str
    email: str
    is_superuser: bool
    is_staff: bool

    model_config = {"from_attributes": True}  # Pydantic v2 way to handle ORM models


class AuthStatusSchema(BaseModel):
    """Authentication status response."""

    authenticated: bool
    user: UserSchema | None = None


# Request schemas
class LoginRequest(BaseModel):
    """Login request schema."""

    username: str
    password: str


class LoginResponse(BaseModel):
    """Login response schema."""

    success: bool
    message: str
    user: UserSchema | None = None


# Endpoints
@router.get("/csrf/", auth=None)
@ensure_csrf_cookie
@csrf_exempt
def get_csrf_token(request):
    """Get CSRF token cookie.

    This endpoint ensures the CSRF cookie is set in the browser.
    According to Django Ninja docs, ensure_csrf_cookie must be used with
    csrf_exempt and return HttpResponse (not dict).
    Call this on app initialization before making any POST requests.
    """
    token = get_token(request)
    return JsonResponse({"csrfToken": token})


@router.get("/status/", response=AuthStatusSchema, auth=None)
def auth_status(request):
    """
    Get current authentication status.

    Returns user information if authenticated, otherwise returns
    authenticated=False.
    Also ensures CSRF cookie is set by calling get_token().
    """
    # Ensure CSRF cookie is set
    get_token(request)

    if request.user.is_authenticated:
        return {
            "authenticated": True,
            "user": UserSchema.model_validate(request.user),
        }
    return {"authenticated": False, "user": None}


@router.post("/login/", response=LoginResponse, auth=None)
def login_user(request, data: LoginRequest):
    """
    Authenticate user and create session.

    Args:
        data: Login credentials (username and password)

    Returns:
        LoginResponse with success status and user information
    """
    user = authenticate(request, username=data.username, password=data.password)

    if user is not None:
        login(request, user)
        return {
            "success": True,
            "message": "Login successful",
            "user": UserSchema.model_validate(user),
        }
    else:
        return {
            "success": False,
            "message": "Invalid username or password",
            "user": None,
        }


@router.post("/logout/")
def logout_user(request):
    """
    Logout current user and destroy session.

    Returns:
        Success message
    """
    logout(request)
    return {"success": True, "message": "Logout successful"}
