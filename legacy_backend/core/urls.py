"""
URL configuration for core app.

NOTE: Frontend UI is now handled by Angular (served from frontend/dist).
These URLs only serve RSS feeds for external RSS readers.
"""

from django.urls import path

from .feeds import ArticleFeed

app_name = "core"

urlpatterns = [
    # RSS feed endpoint for external RSS readers
    path("feeds/<int:feed_id>/rss.xml", ArticleFeed(), name="feed_rss"),
]
