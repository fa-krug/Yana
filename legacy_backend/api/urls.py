"""
URL configuration for API app.
"""

from django.urls import path, re_path

from .views import (
    ClientLoginView,
    EditTagView,
    MarkAllAsReadView,
    StreamContentsView,
    StreamItemIdsView,
    SubscriptionEditView,
    SubscriptionListView,
    TagListView,
    TokenView,
    UnreadCountView,
    UserInfoView,
    ai_status_view,
)

app_name = "api"

urlpatterns = [
    # AI status endpoint
    path("ai-status", ai_status_view, name="ai_status"),
    # Google Reader API endpoints
    path(
        "accounts/ClientLogin", ClientLoginView.as_view(), name="greader_client_login"
    ),
    path("reader/api/0/token", TokenView.as_view(), name="greader_token"),
    path("reader/api/0/user-info", UserInfoView.as_view(), name="greader_user_info"),
    path(
        "reader/api/0/subscription/list",
        SubscriptionListView.as_view(),
        name="greader_subscription_list",
    ),
    path(
        "reader/api/0/subscription/edit",
        SubscriptionEditView.as_view(),
        name="greader_subscription_edit",
    ),
    path("reader/api/0/tag/list", TagListView.as_view(), name="greader_tag_list"),
    path(
        "reader/api/0/stream/items/ids",
        StreamItemIdsView.as_view(),
        name="greader_stream_item_ids",
    ),
    path(
        "reader/api/0/unread-count",
        UnreadCountView.as_view(),
        name="greader_unread_count",
    ),
    path("reader/api/0/edit-tag", EditTagView.as_view(), name="greader_edit_tag"),
    path(
        "reader/api/0/mark-all-as-read",
        MarkAllAsReadView.as_view(),
        name="greader_mark_all_read",
    ),
    # Stream contents with optional stream ID (two URL patterns used by different clients)
    path(
        "reader/api/0/stream/contents/",
        StreamContentsView.as_view(),
        name="greader_stream_contents",
    ),
    path(
        "reader/api/0/stream/items/contents",
        StreamContentsView.as_view(),
        name="greader_stream_items_contents",
    ),
    re_path(
        r"^reader/api/0/stream/contents/(?P<stream_id>.+)$",
        StreamContentsView.as_view(),
        name="greader_stream_contents_id",
    ),
]
