"""Default URL configuration for core app."""

from django.urls import path

from core import views

urlpatterns = [
    path("health/", views.health_check, name="health_check"),
    path("api/youtube-proxy", views.youtube_proxy_view, name="youtube_proxy"),
    path("api/meta", views.meta_view, name="feed_meta"),
]
