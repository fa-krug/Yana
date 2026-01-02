"""
URL configuration for core app.
"""

from django.urls import path

from core import views
from core.autocomplete import FeedIdentifierAutocomplete

urlpatterns = [
    path("health/", views.health_check, name="health_check"),
    path("api/youtube-proxy", views.youtube_proxy_view, name="youtube_proxy"),
    # Autocomplete endpoints
    path(
        "autocomplete/feed-identifier/",
        FeedIdentifierAutocomplete.as_view(),
        name="feed-identifier-autocomplete",
    ),
]
