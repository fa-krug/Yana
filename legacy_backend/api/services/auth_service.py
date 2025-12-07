"""
Authentication service for Google Reader API.

Handles user authentication, token generation, and token validation.
"""

import hashlib
import logging
import secrets
import time

from django.contrib.auth import authenticate
from django.http import HttpRequest
from django.utils import timezone

from core.services.base import BaseService, ValidationError

from ..models import GReaderAuthToken

logger = logging.getLogger(__name__)


class AuthService(BaseService):
    """
    Service for handling Google Reader API authentication.

    Handles:
    - User authentication (ClientLogin)
    - Token generation
    - Token validation
    - Session token generation
    """

    def authenticate_with_credentials(
        self, email: str, password: str, request: HttpRequest = None
    ):
        """
        Authenticate user with email and password.

        Args:
            email: Username/email
            password: Password
            request: Optional HTTP request for authentication context

        Returns:
            Tuple of (user, auth_token) if successful, (None, None) if failed

        Raises:
            ValidationError: If credentials are invalid
        """
        if not email or not password:
            raise ValidationError("Email and password are required")

        # Try to authenticate
        user = authenticate(request, username=email, password=password)

        if not user:
            self.logger.warning(f"Failed GReader API authentication for: {email}")
            return None, None

        # Create auth token
        auth_token = self._create_token_for_user(user)

        self.logger.info(f"GReader API authentication successful for: {user.username}")
        return user, auth_token

    def authenticate_request(self, request: HttpRequest):
        """
        Authenticate the request using the Authorization header or Django session.

        Args:
            request: The HTTP request

        Returns:
            User object or None
        """
        # First, try Authorization header (Google Reader API)
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")

        if auth_header.startswith("GoogleLogin auth="):
            token = auth_header[17:]  # Remove "GoogleLogin auth="
            return self._get_user_by_token(token)

        # Fallback to Django session authentication (for web UI)
        if request.user.is_authenticated:
            return request.user

        return None

    def generate_session_token(self, user) -> str:
        """
        Generate a short-lived session token.

        Args:
            user: The user to generate a token for

        Returns:
            The generated session token (57 characters)
        """
        # Generate a 57-character token (as per Google Reader API spec)
        token = hashlib.sha256(f"{user.pk}:{time.time()}".encode()).hexdigest()[:57]
        return token

    def invalidate_token(self, token: str) -> bool:
        """
        Invalidate an authentication token.

        Args:
            token: The token to invalidate

        Returns:
            True if token was invalidated, False if not found
        """
        try:
            auth_token = GReaderAuthToken.objects.get(token=token)
            auth_token.delete()
            self.logger.info(f"Invalidated token for user: {auth_token.user.username}")
            return True
        except GReaderAuthToken.DoesNotExist:
            return False

    def _generate_token(self, user) -> str:
        """
        Generate a new auth token for a user.

        Args:
            user: The user to generate a token for

        Returns:
            The generated token string
        """
        token = hashlib.sha256(
            f"{user.username}:{user.pk}:{secrets.token_hex(16)}".encode()
        ).hexdigest()
        return token

    def _create_token_for_user(self, user) -> GReaderAuthToken:
        """
        Create a new auth token for a user.

        Args:
            user: The user to create a token for

        Returns:
            The created GReaderAuthToken instance
        """
        token = self._generate_token(user)
        return GReaderAuthToken.objects.create(user=user, token=token)

    def _get_user_by_token(self, token: str):
        """
        Get the user associated with a token.

        Args:
            token: The token to look up

        Returns:
            User object or None if not found/expired
        """
        try:
            auth_token = GReaderAuthToken.objects.select_related("user").get(
                token=token
            )
            # Check if expired
            if auth_token.expires_at and auth_token.expires_at < timezone.now():
                return None
            return auth_token.user
        except GReaderAuthToken.DoesNotExist:
            return None
