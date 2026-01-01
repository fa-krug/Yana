"""Google Reader API authentication service.

Handles token generation, validation, and user authentication for the Google Reader API.
"""

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

from django.contrib.auth import authenticate
from django.contrib.auth.models import User

from core.models import GReaderAuthToken

logger = logging.getLogger(__name__)


class AuthenticationError(Exception):
    """Authentication failed."""
    pass


class TokenExpiredError(Exception):
    """Token has expired."""
    pass


def generate_auth_token(username: str, user_id: int) -> str:
    """Generate a long-lived authentication token.

    Creates a SHA-256 hashed token suitable for long-term storage.

    Args:
        username: Username for logging/debugging
        user_id: Django user ID

    Returns:
        64-character hexadecimal token string
    """
    # Generate random 32 bytes and hash them
    random_bytes = secrets.token_bytes(32)
    token_hash = hashlib.sha256(random_bytes).hexdigest()

    logger.debug(f"Generated auth token for user {username} (ID: {user_id})")

    return token_hash


def generate_session_token(user_id: int) -> str:
    """Generate a short-lived session token.

    For CSRF protection on write operations. Should be short-lived.

    Args:
        user_id: Django user ID

    Returns:
        57-character token string (Google Reader format)
    """
    # Google Reader uses 57-char tokens
    return secrets.token_urlsafe(57)[:57]


def authenticate_with_credentials(email: str, password: str) -> dict | None:
    """Authenticate user with email and password, create and store token.

    Args:
        email: User email address
        password: Plain text password

    Returns:
        Dict with 'SID', 'LSID', 'Auth' tokens and user info, or None if failed

    Raises:
        AuthenticationError: If authentication fails
    """
    # Try to authenticate using Django's auth system
    # Django's authenticate checks both username and email by default
    user = authenticate(username=email, password=password)

    if user is None:
        # Try again with User lookup in case email is stored differently
        try:
            user = User.objects.get(email=email)
            user = authenticate(username=user.username, password=password)
        except User.DoesNotExist:
            user = None

    if user is None:
        logger.warning(f"Failed authentication attempt for email: {email}")
        raise AuthenticationError("BadAuthentication")

    # Generate token
    auth_token = generate_auth_token(user.username, user.id)

    # Store token in database
    GReaderAuthToken.objects.create(
        user=user,
        token=auth_token,
        expires_at=None,  # No expiry for auth tokens by default
    )

    logger.info(f"User {user.username} authenticated via Google Reader API")

    # Return tokens in Google Reader format
    return {
        "SID": auth_token,
        "LSID": "",  # Deprecated in Google Reader but included for compatibility
        "Auth": auth_token,
        "userId": str(user.id),
        "userName": user.username,
        "userEmail": user.email,
    }


def authenticate_request(
    auth_header: str | None,
    session_user_id: int | None = None,
) -> dict | None:
    """Authenticate request from Authorization header or session.

    Args:
        auth_header: Authorization header value, e.g., 'GoogleLogin auth=TOKEN'
        session_user_id: Django session user ID (fallback)

    Returns:
        Dict with user info (id, username, email) or None if not authenticated
    """
    # First try Authorization header
    if auth_header:
        return _authenticate_with_header(auth_header)

    # Fall back to session
    if session_user_id:
        try:
            user = User.objects.get(id=session_user_id)
            return {
                "id": user.id,
                "username": user.username,
                "email": user.email,
            }
        except User.DoesNotExist:
            return None

    return None


def _authenticate_with_header(auth_header: str) -> dict | None:
    """Extract and validate token from Authorization header.

    Expected format: 'GoogleLogin auth=TOKEN'

    Args:
        auth_header: Full Authorization header value

    Returns:
        Dict with user info or None if invalid
    """
    if not auth_header:
        return None

    # Parse header
    parts = auth_header.split("=", 1)
    if len(parts) != 2:
        return None

    auth_type, token = parts
    auth_type = auth_type.strip().lower()

    if auth_type != "googlelogin auth":
        return None

    token = token.strip()

    # Query token from database
    try:
        auth_token = GReaderAuthToken.objects.select_related("user").get(token=token)
    except GReaderAuthToken.DoesNotExist:
        logger.warning(f"Authentication failed: token not found")
        return None

    # Check expiry
    if auth_token.expires_at:
        now = datetime.now(timezone.utc)
        expires_at = auth_token.expires_at

        # Handle both aware and naive datetimes
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

        if now > expires_at:
            logger.warning(f"Authentication failed: token expired")
            return None

    # Return user info
    user = auth_token.user
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
    }


def validate_token(token_str: str) -> bool:
    """Check if a token exists and is valid (not expired).

    Args:
        token_str: Token to validate

    Returns:
        True if valid, False otherwise
    """
    try:
        auth_token = GReaderAuthToken.objects.get(token=token_str)

        # Check expiry
        if auth_token.expires_at:
            now = datetime.now(timezone.utc)
            expires_at = auth_token.expires_at

            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)

            if now > expires_at:
                return False

        return True

    except GReaderAuthToken.DoesNotExist:
        return False


def revoke_token(token_str: str) -> bool:
    """Delete a token (revoke authentication).

    Args:
        token_str: Token to revoke

    Returns:
        True if deleted, False if not found
    """
    try:
        auth_token = GReaderAuthToken.objects.get(token=token_str)
        auth_token.delete()
        logger.info(f"Token revoked for user {auth_token.user.username}")
        return True
    except GReaderAuthToken.DoesNotExist:
        return False


def cleanup_expired_tokens() -> int:
    """Delete all expired tokens from database.

    Returns:
        Number of tokens deleted
    """
    now = datetime.now(timezone.utc)

    # Handle both aware and naive datetimes in the query
    tokens = GReaderAuthToken.objects.filter(expires_at__lte=now)
    count, _ = tokens.delete()

    if count > 0:
        logger.info(f"Cleaned up {count} expired tokens")

    return count
