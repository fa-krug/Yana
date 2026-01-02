"""
File storage handler for feed icons.

Handles saving raw image bytes to Django ImageField on the Feed model.
"""

import logging
import os
import uuid

from django.core.files.base import ContentFile

from core.models import Feed

logger = logging.getLogger(__name__)


class FeedIconFileHandler:
    """Handles saving feed icons to Feed models."""

    @staticmethod
    def save_icon_to_feed(feed: Feed, image_bytes: bytes, content_type: str) -> bool:
        """
        Save image bytes to Feed.icon ImageField.

        Args:
            feed: Feed instance
            image_bytes: Raw image data
            content_type: MIME type

        Returns:
            True if successful, False otherwise
        """
        if not image_bytes:
            return False

        try:
            # Generate a unique filename
            extension = content_type.split("/")[-1]
            if extension == "jpeg":
                extension = "jpg"
            elif "icon" in extension or "vnd.microsoft.icon" in content_type:
                extension = "ico"

            # Sanitize extension (limit length and remove weird chars)
            extension = "".join(c for c in extension if c.isalnum())[:4]
            if not extension:
                extension = "jpg"

            filename = f"feed_{feed.id}_{uuid.uuid4().hex[:8]}.{extension}"

            # If feed already has an icon, we might want to delete the old file?
            # For now, we'll just let Django handle it or overwrite.
            if feed.icon:
                try:
                    if os.path.isfile(feed.icon.path):
                        os.remove(feed.icon.path)
                except Exception as e:
                    logger.warning(f"Failed to remove old feed icon for feed {feed.id}: {e}")

            # Save to ImageField
            # This handles file storage and updating the database field
            feed.icon.save(filename, ContentFile(image_bytes), save=True)

            logger.info(f"Successfully saved feed icon to feed {feed.id}: {filename}")
            return True

        except Exception as e:
            logger.error(f"Failed to save feed icon to feed {feed.id}: {e}")
            return False
