"""
User service for Google Reader API.

Handles user information retrieval and formatting.
"""

import logging

from core.services.base import BaseService

logger = logging.getLogger(__name__)


class UserService(BaseService):
    """
    Service for handling user information in Google Reader API.

    Handles:
    - User metadata retrieval
    - User info formatting
    """

    def get_user_info(self, user) -> dict:
        """
        Get user information in Google Reader API format.

        Args:
            user: The user object

        Returns:
            Dictionary with user information
        """
        return {
            "userId": str(user.pk),
            "userName": user.username,
            "userProfileId": str(user.pk),
            "userEmail": user.email or f"{user.username}@localhost",
        }
