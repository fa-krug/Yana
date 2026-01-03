"""Google Reader API URL configuration.

Maps HTTP endpoints to view handlers for the Google Reader API.
"""

from django.urls import path

from core.views.greader.auth import client_login, token_view, user_info
from core.views.greader.preference import (
    preference_list,
    preference_stream_list,
)
from core.views.greader.stream import (
    stream_contents,
    stream_items_ids,
    unread_count,
)
from core.views.greader.subscription import subscription_edit, subscription_list
from core.views.greader.tag import (
    disable_tag,
    edit_tag,
    mark_all_as_read,
    tag_list,
)

app_name = "greader"

urlpatterns = [
    # Authentication endpoints
    path("accounts/ClientLogin", client_login, name="client_login"),
    path("reader/api/0/token", token_view, name="token"),
    path("reader/api/0/user-info", user_info, name="user_info"),
    # Preference endpoints
    path("reader/api/0/preference/list", preference_list, name="preference_list"),
    path(
        "reader/api/0/preference/stream/list", preference_stream_list, name="preference_stream_list"
    ),
    # Subscription endpoints
    path("reader/api/0/subscription/list", subscription_list, name="subscription_list"),
    path("reader/api/0/subscription/edit", subscription_edit, name="subscription_edit"),
    # Tag endpoints
    path("reader/api/0/tag/list", tag_list, name="tag_list"),
    path("reader/api/0/edit-tag", edit_tag, name="edit_tag"),
    path("reader/api/0/disable-tag", disable_tag, name="disable_tag"),
    path("reader/api/0/mark-all-as-read", mark_all_as_read, name="mark_all_as_read"),
    # Stream endpoints
    path("reader/api/0/unread-count", unread_count, name="unread_count"),
    path("reader/api/0/stream/items/ids", stream_items_ids, name="stream_items_ids"),
    path("reader/api/0/stream/contents", stream_contents, name="stream_contents"),
    path(
        "reader/api/0/stream/contents/<path:stream_id>",
        stream_contents,
        name="stream_contents_with_id",
    ),
    path("reader/api/0/stream/items/contents", stream_contents, name="stream_items_contents"),
]
