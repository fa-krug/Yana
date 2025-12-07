"""
URL configuration for yana project.

NOTE: Frontend UI is now handled by Angular SPA.
All non-API routes serve the Angular application via the catch-all pattern.
"""

from django.contrib import admin
from django.urls import include, path, re_path
from django.views.generic import TemplateView

from api.views import youtube_proxy_view
from api_v1.api import api as api_v1

urlpatterns = [
    # Admin interface
    path("admin/", admin.site.urls),
    # API endpoints
    path("api/v1/", api_v1.urls),  # Django Ninja REST API for Angular
    path("api/greader/", include("api.urls")),  # Google Reader API (RSS readers)
    path("api/youtube-proxy", youtube_proxy_view, name="youtube_proxy"),
    # RSS feeds (served by Django for external RSS readers)
    path("", include("core.urls")),
    # Angular SPA - catch-all route (must be last!)
    # Serves index.html for all unmatched routes to enable client-side routing
    re_path(
        r"^.*$", TemplateView.as_view(template_name="index.html"), name="angular_app"
    ),
]
