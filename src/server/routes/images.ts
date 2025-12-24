/**
 * Image proxy routes.
 *
 * Proxies external images through the server to avoid Safari service worker issues
 * and CORS problems. This ensures images load reliably across all browsers.
 */

import axios from "axios";
import { Router } from "express";
import type { Request, Response } from "express";

import { logger } from "../utils/logger";

const router = Router();

/**
 * GET /api/image-proxy
 * Proxies external images through the server
 *
 * Query parameters:
 * - url: The URL of the image to proxy (required, must be URL encoded)
 * - maxAge: Cache control max-age in seconds (default: 86400 = 1 day)
 */
router.get("/image-proxy", async (req: Request, res: Response) => {
  try {
    const imageUrl = req.query["url"];

    if (!imageUrl || typeof imageUrl !== "string") {
      res.status(400).json({ error: "Missing or invalid 'url' parameter" });
      return;
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(imageUrl);
    } catch {
      res.status(400).json({ error: "Invalid URL format" });
      return;
    }

    // Only allow http/https URLs for security
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      res.status(400).json({ error: "Only http and https URLs are allowed" });
      return;
    }

    // Get cache max-age (default 1 day)
    const maxAge =
      parseInt((req.query["maxAge"] as string) || "86400", 10) || 86400;

    logger.debug({ imageUrl, maxAge }, "Proxying image request");

    try {
      // Fetch the image with appropriate headers
      const response = await axios.get(imageUrl, {
        responseType: "stream",
        timeout: 30000, // 30 second timeout
        maxRedirects: 5,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept:
            "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          // Add referer for sites that require it (e.g., Reddit)
          Referer: parsedUrl.origin,
        },
        validateStatus: (status) => status >= 200 && status < 400,
      });

      // Get content type from response or guess from URL
      let contentType = response.headers["content-type"] || "";
      if (!contentType || contentType === "application/octet-stream") {
        const urlLower = imageUrl.toLowerCase();
        if (urlLower.includes(".jpg") || urlLower.includes(".jpeg")) {
          contentType = "image/jpeg";
        } else if (urlLower.includes(".png")) {
          contentType = "image/png";
        } else if (urlLower.includes(".gif")) {
          contentType = "image/gif";
        } else if (urlLower.includes(".webp")) {
          contentType = "image/webp";
        } else if (urlLower.includes(".svg")) {
          contentType = "image/svg+xml";
        } else {
          contentType = "image/jpeg"; // Default fallback
        }
      }

      // Set response headers
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", `public, max-age=${maxAge}, immutable`);
      res.setHeader("X-Content-Type-Options", "nosniff");

      // Copy content-length if available
      if (response.headers["content-length"]) {
        res.setHeader("Content-Length", response.headers["content-length"]);
      }

      // Stream the image data to the client
      response.data.pipe(res);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status || 500;
        const message =
          error.response?.statusText ||
          error.message ||
          "Failed to fetch image";

        logger.warn(
          {
            error: error.message,
            imageUrl,
            status,
          },
          "Failed to proxy image",
        );

        res.status(status).json({
          error: "Failed to fetch image",
          message,
          url: imageUrl,
        });
      } else {
        logger.error(
          {
            error: error instanceof Error ? error : new Error(String(error)),
            imageUrl,
          },
          "Unexpected error proxying image",
        );

        res.status(500).json({
          error: "Internal server error",
          message: "An unexpected error occurred while proxying the image",
        });
      }
    }
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error : new Error(String(error)),
      },
      "Error in image proxy handler",
    );

    res.status(500).json({
      error: "Internal server error",
      message: "An unexpected error occurred",
    });
  }
});

export function imageProxyRoutes(): Router {
  return router;
}
