"""PWA views for the application."""

import json

from django.contrib.auth.decorators import login_required
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render
from django.views.decorators.http import require_POST, require_GET

from core.models import Article


@login_required
@require_GET
def sync_articles(request):
    """
    Return all articles for the current user to sync the PWA.
    Returns a JSON list of article objects.
    """
    user = request.user

    # Get articles from feeds directly assigned to user OR feeds in groups assigned to user
    articles = Article.objects.filter(
        Q(feed__user=user) | Q(feed__group__user=user)
    ).select_related('feed').order_by('-date')

    data = []
    for article in articles:
        # Determine icon URL
        icon_url = ""
        if article.icon:
            icon_url = article.icon.url
        elif article.feed.reddit_subreddit:
             # Fallback/Logic for reddit icon if needed, but article.icon should be populated
             pass

        # If article.icon is missing, maybe we can use a default or the feed's icon if we had one.
        # For now, we rely on article.icon as per plan.

        data.append({
            "id": article.id,
            "title": article.name,
            "url": article.identifier,
            "content": article.content,
            "read": article.read,
            "date": article.date.isoformat(),
            "feed_name": article.feed.name,
            "icon_url": icon_url,
        })

    return JsonResponse({"articles": data})


@login_required
@require_POST
def mark_read(request):
    """
    Mark an article as read.
    Expects JSON body: {"article_id": <int>}
    """
    try:
        body = json.loads(request.body)
        article_id = body.get("article_id")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    if not article_id:
        return JsonResponse({"error": "Missing article_id"}, status=400)

    # Ensure the user owns the article
    article = get_object_or_404(
        Article,
        Q(pk=article_id) & (Q(feed__user=request.user) | Q(feed__group__user=request.user))
    )

    article.read = True
    article.save(update_fields=["read"])

    return JsonResponse({"success": True, "id": article.id})


@login_required
def pwa_index(request):
    """Render the PWA shell."""
    return render(request, "core/pwa/index.html")
