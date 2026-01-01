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
 * Guess content type from URL.
 */
function guessContentType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes(".jpg") || lower.includes(".jpeg")) return "image/jpeg";
  if (lower.includes(".png")) return "image/png";
  if (lower.includes(".gif")) return "image/gif";
  if (lower.includes(".webp")) return "image/webp";
  if (lower.includes(".svg")) return "image/svg+xml";
  return "image/jpeg";
}

/**
 * Handle proxy error response.
 */
function handleProxyError(
  res: Response,
  error: unknown,
  imageUrl: string,
): void {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status || 500;
    logger.warn(
      { error: error.message, imageUrl, status },
      "Failed to proxy image",
    );
    res.status(status).json({
      error: "Failed to fetch image",
      message: error.response?.statusText || error.message,
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
      message: "An unexpected error occurred",
    });
  }
}

/**
 * GET /api/image-proxy
 */
router.get(
  "/image-proxy",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const imageUrl = req.query["url"];
      if (!imageUrl || typeof imageUrl !== "string") {
        res.status(400).json({ error: "Missing or invalid 'url' parameter" });
        return;
      }

      const parsedUrl = new URL(imageUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        res.status(400).json({ error: "Only http and https URLs are allowed" });
        return;
      }

      const maxAge =
        parseInt((req.query["maxAge"] as string) || "86400", 10) || 86400;
      logger.debug({ imageUrl, maxAge }, "Proxying image request");

      try {
        const response = await axios.get(imageUrl, {
          responseType: "stream",
          timeout: 30000,
          maxRedirects: 5,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            Accept:
              "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            Referer: parsedUrl.origin,
          },
          validateStatus: (status) => status >= 200 && status < 400,
        });

        let contentType = response.headers["content-type"] || "";
        if (!contentType || contentType === "application/octet-stream") {
          contentType = guessContentType(imageUrl);
        }

        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", `public, max-age=${maxAge}, immutable`);
        res.setHeader("X-Content-Type-Options", "nosniff");
        if (response.headers["content-length"])
          res.setHeader("Content-Length", response.headers["content-length"]);

        response.data.pipe(res);
      } catch (error) {
        handleProxyError(res, error, imageUrl);
      }
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error : new Error(String(error)) },
        "Error in image proxy handler",
      );
      res.status(500).json({
        error: "Internal server error",
        message: "An unexpected error occurred",
      });
    }
  },
);

export function imageProxyRoutes(): Router {
  return router;
}
