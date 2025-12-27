/**
 * MIME type detection for images using handler pattern.
 * Supports multiple file extensions and content-type headers.
 */

/**
 * Handler interface for detecting image MIME types from URLs.
 */
interface MimeTypeHandler {
  canHandle(url: string): boolean;
  getMimeType(): string;
}

/**
 * JPEG MIME type handler (.jpg, .jpeg).
 */
class JpegMimeHandler implements MimeTypeHandler {
  canHandle(url: string): boolean {
    const urlLower = url.toLowerCase();
    return urlLower.endsWith(".jpg") || urlLower.endsWith(".jpeg");
  }

  getMimeType(): string {
    return "image/jpeg";
  }
}

/**
 * PNG MIME type handler (.png).
 */
class PngMimeHandler implements MimeTypeHandler {
  canHandle(url: string): boolean {
    return url.toLowerCase().endsWith(".png");
  }

  getMimeType(): string {
    return "image/png";
  }
}

/**
 * GIF MIME type handler (.gif).
 */
class GifMimeHandler implements MimeTypeHandler {
  canHandle(url: string): boolean {
    return url.toLowerCase().endsWith(".gif");
  }

  getMimeType(): string {
    return "image/gif";
  }
}

/**
 * WebP MIME type handler (.webp, .webm).
 */
class WebpMimeHandler implements MimeTypeHandler {
  canHandle(url: string): boolean {
    const urlLower = url.toLowerCase();
    return urlLower.endsWith(".webp") || urlLower.endsWith(".webm");
  }

  getMimeType(): string {
    return "image/webp";
  }
}

/**
 * ICO MIME type handler (.ico).
 */
class IcoMimeHandler implements MimeTypeHandler {
  canHandle(url: string): boolean {
    return url.toLowerCase().endsWith(".ico");
  }

  getMimeType(): string {
    return "image/x-icon";
  }
}

/**
 * SVG MIME type handler (.svg).
 */
class SvgMimeHandler implements MimeTypeHandler {
  canHandle(url: string): boolean {
    return url.toLowerCase().endsWith(".svg");
  }

  getMimeType(): string {
    return "image/svg+xml";
  }
}

/**
 * MIME type detector orchestrator.
 * Detects image MIME type from HTTP headers or URL extension.
 * Priority: Header > URL extension
 */
export class MimeTypeDetector {
  private handlers: MimeTypeHandler[] = [
    new JpegMimeHandler(),
    new PngMimeHandler(),
    new GifMimeHandler(),
    new WebpMimeHandler(),
    new IcoMimeHandler(),
    new SvgMimeHandler(),
  ];

  /**
   * Detect MIME type from content-type header or URL.
   * Returns null if unable to determine.
   */
  detect(
    url: string,
    contentTypeHeader: string | undefined,
  ): string | null {
    // Try header first
    if (
      contentTypeHeader &&
      contentTypeHeader !== "application/octet-stream"
    ) {
      return contentTypeHeader.split(";")[0].trim();
    }

    // Try URL-based handlers
    const handler = this.handlers.find((h) => h.canHandle(url));
    return handler ? handler.getMimeType() : null;
  }
}
