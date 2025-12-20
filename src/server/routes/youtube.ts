/**
 * YouTube proxy routes.
 *
 * Provides YouTube video embedding proxy.
 */

import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

/**
 * GET /api/youtube-proxy
 * YouTube video proxy page for embedding videos
 */
router.get("/youtube-proxy", (req: Request, res: Response): void => {
  // Parse URL parameters on server side
  const videoId = (req.query["v"] as string) || "";

  if (!videoId) {
    const errorHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>YouTube Video - Yana</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #000;
    }
    .error {
      color: white;
      padding: 20px;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
  </style>
</head>
<body>
  <div class="error">Error: Missing video ID parameter (?v=VIDEO_ID)</div>
</body>
</html>`;
    res.setHeader("Content-Type", "text/html");
    // X-Frame-Options is disabled via helmet frameguard: false for this route
    // Embedding is controlled via CSP frame-ancestors: * in security middleware
    res.send(errorHtml);
    return;
  }

  // Get optional parameters with defaults
  const autoplay = (req.query["autoplay"] as string) || "0";
  const loop = (req.query["loop"] as string) || "0";
  const mute = (req.query["mute"] as string) || "0";
  const playlist = (req.query["playlist"] as string) || videoId;
  const controls = (req.query["controls"] as string) || "1";
  const rel = (req.query["rel"] as string) || "0";
  const modestbranding = (req.query["modestbranding"] as string) || "1";
  const playsinline = (req.query["playsinline"] as string) || "1";

  // Build YouTube embed URL parameters
  const embedParams = new URLSearchParams({
    autoplay: autoplay,
    controls: controls,
    rel: rel,
    modestbranding: modestbranding,
    playsinline: playsinline,
    enablejsapi: "1",
    origin: req.protocol + "://" + req.get("host") || "",
  });

  // Add loop and playlist if loop is enabled
  if (loop === "1") {
    embedParams.append("loop", "1");
    embedParams.append("playlist", playlist);
  }

  // Add mute if enabled
  if (mute === "1") {
    embedParams.append("mute", "1");
  }

  // Construct final embed URL
  const embedUrl = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?${embedParams.toString()}`;

  // Render HTML with embed URL already set
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <title>YouTube Video - Yana</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #000;
    }
    #player {
      border: 0;
      width: 100%;
      height: calc((512px / 16) * 9);
    }
    @media (max-width: 512px) {
      #player {
        height: calc((100vw / 16) * 9);
      }
    }
  </style>
</head>
<body>
  <iframe
    id="player"
    src="${embedUrl}"
    allowfullscreen
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    referrerpolicy="strict-origin-when-cross-origin"
  ></iframe>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html");
  // X-Frame-Options is disabled via helmet frameguard: false for this route
  // Embedding is controlled via CSP frame-ancestors: * in security middleware
  res.send(html);
});

export function youtubeRoutes(): Router {
  return router;
}
