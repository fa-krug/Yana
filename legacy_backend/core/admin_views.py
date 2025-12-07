"""
Custom admin views for Feed management.
"""

import logging
from typing import Any

from django.contrib import messages
from django.contrib.admin.views.decorators import staff_member_required
from django.http import HttpRequest, HttpResponse
from django.shortcuts import redirect, render

from aggregators import get_aggregator_metadata, get_all_aggregators

from .models import Feed

logger = logging.getLogger(__name__)


@staff_member_required
def select_aggregator_view(request: HttpRequest) -> HttpResponse:
    """
    View for selecting an aggregator when creating a new feed.

    Shows all available aggregators grouped by type (managed/social/custom)
    with their metadata (name, description, URL for managed, identifier for social).
    """
    all_aggregators = get_all_aggregators()

    # Group aggregators by type
    managed_aggregators = [agg for agg in all_aggregators if agg.type == "managed"]
    social_aggregators = [agg for agg in all_aggregators if agg.type == "social"]
    custom_aggregators = [agg for agg in all_aggregators if agg.type == "custom"]

    context = {
        "title": "Select Aggregator",
        "managed_aggregators": managed_aggregators,
        "social_aggregators": social_aggregators,
        "custom_aggregators": custom_aggregators,
        "opts": Feed._meta,
        "has_view_permission": True,
        "site_title": "Yana administration",
        "site_header": "Yana",
    }

    return render(request, "admin/core/feed/select_aggregator.html", context)


@staff_member_required
def create_feed_from_aggregator(request: HttpRequest, module_name: str) -> HttpResponse:
    """
    Create a feed from an aggregator.

    For managed aggregators: Creates the feed immediately and redirects to list.
    For custom aggregators: Creates a placeholder feed and redirects to edit view.
    """
    metadata = get_aggregator_metadata(module_name)

    if not metadata:
        messages.error(request, f"Aggregator '{module_name}' not found.")
        return redirect("admin:core_feed_changelist")

    try:
        if metadata.type == "managed":
            # For managed feeds, create with full details
            if not metadata.url:
                messages.error(
                    request,
                    f"Managed aggregator '{metadata.name}' is missing an identifier configuration.",
                )
                return redirect("admin:core_feed_select_aggregator")

            # Generate a unique name if feed with same identifier already exists
            base_name = metadata.name
            feed_name = base_name
            counter = 2

            # Keep incrementing until we find a unique name or no duplicate exists
            while Feed.objects.filter(identifier=metadata.url, name=feed_name).exists():
                feed_name = f"{base_name} ({counter})"
                counter += 1

            # Create the managed feed
            feed = Feed.objects.create(
                name=feed_name,
                identifier=metadata.url,
                aggregator=metadata.id,
                enabled=True,
            )

            if counter > 2:
                messages.success(
                    request,
                    f"Managed feed '{feed_name}' has been created and enabled. "
                    f"A feed with this URL already exists, so a unique name was assigned.",
                )
            else:
                messages.success(
                    request,
                    f"Managed feed '{feed_name}' has been created and enabled.",
                )
            logger.info(f"Created managed feed: {feed.name} (ID: {feed.id})")
            return redirect("admin:core_feed_changelist")

        else:
            # For custom and social feeds, create placeholder and redirect to edit
            # Use a temporary identifier that the user will change
            import time

            timestamp = int(time.time() * 1000)
            temp_identifier = f"placeholder-{module_name}-{timestamp}"

            # Generate placeholder name
            placeholder_name = f"[Configure] {metadata.name}"

            # Determine feed type based on aggregator
            feed_type = "article"
            if metadata.id == "reddit":
                feed_type = "reddit"
            elif metadata.id == "youtube":
                feed_type = "youtube"

            # Set default daily_post_limit for social feeds
            feed_kwargs = {
                "name": placeholder_name,
                "identifier": temp_identifier,
                "aggregator": metadata.id,
                "feed_type": feed_type,
                "enabled": False,  # Disabled until configured
            }
            if metadata.type == "social":
                feed_kwargs["daily_post_limit"] = 10

            feed = Feed.objects.create(**feed_kwargs)

            # Provide appropriate message based on aggregator type
            if metadata.type == "social":
                identifier_label = metadata.identifier_label or "identifier"
                messages.warning(
                    request,
                    f"Please configure the {identifier_label.lower()} for '{metadata.name}'. "
                    f"Feed is disabled until properly configured.",
                )
            else:
                messages.warning(
                    request,
                    f"Please configure the feed name and URL for '{metadata.name}'. "
                    f"Feed is disabled until properly configured.",
                )
            logger.info(f"Created {metadata.type} feed placeholder (ID: {feed.id})")
            return redirect("admin:core_feed_change", feed.id)

    except Exception as e:
        logger.error(f"Error creating feed from aggregator {module_name}: {e}")
        messages.error(request, f"Error creating feed: {e}")
        return redirect("admin:core_feed_select_aggregator")


def get_aggregator_info(aggregator_id: str) -> dict[str, Any]:
    """
    Get aggregator information from metadata.

    Args:
        aggregator_id: Aggregator ID (e.g., 'heise', 'default')

    Returns:
        Dictionary with aggregator info (name, type, description, url, identifier fields)
        Returns type='broken' if aggregator not found in registry
    """
    from aggregators import get_aggregator_by_id

    # Get metadata by ID
    metadata = get_aggregator_by_id(aggregator_id)
    if metadata:
        return {
            "name": metadata.name,
            "type": metadata.type,
            "description": metadata.description,
            "url": metadata.url,
            "identifier_label": metadata.identifier_label,
            "identifier_description": metadata.identifier_description,
            "identifier_placeholder": metadata.identifier_placeholder,
            "identifier_choices": metadata.identifier_choices,
            "identifier_editable": metadata.identifier_editable,
        }

    # Not found - it's broken
    logger.warning(f"Aggregator '{aggregator_id}' not found in registry")
    return {
        "name": aggregator_id.replace("_", " ").title(),
        "type": "broken",
        "description": f"Aggregator '{aggregator_id}' not found.",
        "url": None,
        "identifier_label": None,
        "identifier_description": None,
        "identifier_placeholder": None,
        "identifier_choices": None,
        "identifier_editable": False,
    }
