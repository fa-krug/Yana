"""Default views for health checks and proxies."""

from urllib.parse import urlencode

from django.db import connection
from django.http import HttpResponse, JsonResponse
from django.views.decorators.clickjacking import xframe_options_exempt
from django.views.decorators.http import require_http_methods


@xframe_options_exempt
@require_http_methods(["GET"])
def youtube_proxy_view(request):
    """
    Serve embedded YouTube videos via a privacy-enhanced proxy endpoint.

    This endpoint accepts a YouTube video ID and returns an HTML page with
    an embedded YouTube iframe using youtube-nocookie.com for privacy.

    Query Parameters:
        v (required): YouTube video ID
        autoplay (optional): Auto-play video (0 or 1, default: 0)
        loop (optional): Loop video (0 or 1, default: 0)
        mute (optional): Mute audio (0 or 1, default: 0)
        controls (optional): Show controls (0 or 1, default: 1)
        rel (optional): Show related videos (0 or 1, default: 0)
        modestbranding (optional): Minimal YouTube branding (0 or 1, default: 1)
        playsinline (optional): Play inline on mobile (0 or 1, default: 1)

    Returns:
        HttpResponse: HTML page with YouTube iframe embed
        400: If video ID is missing
    """
    # Extract video ID (required)
    video_id = request.GET.get("v", "").strip()

    if not video_id:
        return _error_response("Error: Missing video ID parameter (?v=VIDEO_ID)")

    # Extract optional parameters with defaults
    autoplay = request.GET.get("autoplay", "0")
    loop = request.GET.get("loop", "0")
    mute = request.GET.get("mute", "0")
    controls = request.GET.get("controls", "1")
    rel = request.GET.get("rel", "0")
    modestbranding = request.GET.get("modestbranding", "1")
    playsinline = request.GET.get("playsinline", "1")

    # Build YouTube embed URL with parameters
    embed_params = {
        "autoplay": autoplay,
        "loop": loop,
        "mute": mute,
        "controls": controls,
        "rel": rel,
        "modestbranding": modestbranding,
        "playsinline": playsinline,
        "enablejsapi": "1",
        "origin": f"{request.scheme}://{request.get_host()}",
    }

    # If loop is enabled, add playlist parameter (required by YouTube)
    if loop == "1":
        embed_params["playlist"] = video_id

    embed_url = f"https://www.youtube-nocookie.com/embed/{video_id}?{urlencode(embed_params)}"

    html = _generate_embed_html(embed_url)

    return HttpResponse(html, content_type="text/html")


@xframe_options_exempt
@require_http_methods(["GET"])
def meta_view(request):
    """
    Provide metadata for a feed as an HTML page.

    This endpoint returns an HTML page containing the feed's icon and an iframe
    embedding the feed's source URL. This is intended to be used as both the
    website URL and feed URL for certain specialized feeds.

    Query Parameters:
        id (required): The ID of the feed to display metadata for.

    Returns:
        HttpResponse: HTML page with feed icon and source iframe
        400: If feed ID is missing or invalid
        404: If feed is not found
    """
    feed_id = request.GET.get("id", "").strip()

    if not feed_id:
        return HttpResponse(
            "Error: Missing feed ID parameter (?id=FEED_ID)", status=400, content_type="text/plain"
        )

    from core.aggregators.registry import get_aggregator
    from core.models import Feed

    try:
        feed = Feed.objects.get(id=feed_id)
    except Feed.DoesNotExist:
        return HttpResponse(
            f"Error: Feed with ID {feed_id} not found", status=404, content_type="text/plain"
        )
    except (ValueError, TypeError):
        return HttpResponse(
            f"Error: Invalid feed ID '{feed_id}'", status=400, content_type="text/plain"
        )

    # Get icon URL
    icon_url = "/static/core/img/favicon.svg"  # Default
    alternate_icon_url = "/static/core/img/favicon.ico"  # Default

    if feed.icon:
        full_icon_url = request.build_absolute_uri(feed.icon.url)
        icon_url = full_icon_url
        alternate_icon_url = full_icon_url

    # Get source URL from aggregator
    try:
        aggregator = get_aggregator(feed)
        source_url = aggregator.get_source_url()
    except Exception:
        source_url = feed.identifier if feed.identifier.startswith("http") else ""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <meta name="referrer" content="no-referrer-when-downgrade">
    <title>{feed.name}</title>
    <link rel="icon" href="{icon_url}">
    <link rel="alternate icon" href="{alternate_icon_url}">
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}

        html, body {{
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: #f8f9fa;
        }}

        .meta-container {{
            position: relative;
            width: 100%;
            height: 100%;
        }}

        .meta-container iframe {{
            border: 0;
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
        }}

        .no-source {{
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: #6c757d;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            padding: 40px;
            text-align: center;
        }}
    </style>
</head>
<body>
    <div class="meta-container">
        {f'<iframe src="{source_url}" allowfullscreen></iframe>' if source_url else '<div class="no-source"><p>No source URL available for this feed.</p></div>'}
    </div>
</body>
</html>"""

    return HttpResponse(html, content_type="text/html")


def _error_response(message):
    """Generate an error response page."""
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>YouTube Error - Yana</title>
    <link rel="icon" type="image/svg+xml" href="/static/core/img/favicon.svg">
    <link rel="alternate icon" type="image/x-icon" href="/static/core/img/favicon.ico">
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        html, body {{ width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #000; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }}
        .error-message {{ color: #fff; text-align: center; padding: 20px; }}
        .error-message p {{ font-size: 18px; margin-bottom: 10px; }}
        .error-message code {{ background: #222; padding: 10px 15px; border-radius: 4px; display: inline-block; font-family: monospace; }}
    </style>
</head>
<body>
    <div class="error-message">
        <p>{message}</p>
        <code>GET /api/youtube-proxy?v=VIDEO_ID</code>
    </div>
</body>
</html>"""
    return HttpResponse(html, content_type="text/html", status=400)


def _generate_embed_html(embed_url):
    """Generate HTML page with YouTube embed."""
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <title>YouTube Video - Yana</title>
    <link rel="icon" type="image/svg+xml" href="/static/core/img/favicon.svg">
    <link rel="alternate icon" type="image/x-icon" href="/static/core/img/favicon.ico">
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}

        html, body {{
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: #000;
        }}

        .youtube-embed-container {{
            position: relative;
            width: 100%;
            height: 100%;
            padding-bottom: 56.25%;  /* 16:9 aspect ratio */
        }}

        .youtube-embed-container iframe {{
            border: 0;
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
        }}

        @media (max-width: 512px) {{
            .youtube-embed-container {{
                height: 100%;
                padding-bottom: 0;
            }}
        }}
    </style>
</head>
<body>
    <div class="youtube-embed-container">
        <iframe
            src="{embed_url}"
            width="560"
            height="315"
            allowfullscreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerpolicy="strict-origin-when-cross-origin"
        ></iframe>
    </div>
</body>
</html>"""
    return html


@require_http_methods(["GET"])
def health_check(request):
    """
    Health check endpoint for Docker and monitoring services.

    Returns a JSON response indicating the health status of the application,
    including database connectivity status.

    Returns:
        200: Application is healthy
        503: Application is unhealthy (database unreachable or other issues)
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return JsonResponse({"status": "healthy", "database": "connected"})
    except Exception as e:
        return JsonResponse({"status": "unhealthy", "error": str(e)}, status=503)
