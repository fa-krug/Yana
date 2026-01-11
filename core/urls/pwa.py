"""PWA URL configuration."""

from django.urls import path

from core.views import pwa

urlpatterns = [
    path("sync/", pwa.sync_articles, name="pwa_sync"),
    path("read/", pwa.mark_read, name="pwa_mark_read"),
]
