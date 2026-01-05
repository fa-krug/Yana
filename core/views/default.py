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


def _error_response(message):
    """Generate an error response page."""
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>YouTube Error - Yana</title>
    <link rel="icon" type="image/png" href="/static/core/img/icon.png">
    <link rel="apple-touch-icon" href="/static/core/img/apple-touch-icon.png">
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
    <link rel="icon" type="image/png" href="/static/core/img/icon.png">
    <link rel="apple-touch-icon" href="/static/core/img/apple-touch-icon.png">
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
