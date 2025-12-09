/**
 * Image proxy utility.
 *
 * Converts external image URLs to proxied URLs to avoid Safari service worker issues
 * and CORS problems. Internal/same-origin images are returned as-is.
 */

/**
 * Check if a URL is external (different origin from current page).
 */
function isExternalUrl(url: string): boolean {
  try {
    const urlObj = new URL(url, window.location.href);
    return urlObj.origin !== window.location.origin;
  } catch {
    // If URL parsing fails, assume it's external if it starts with http:// or https://
    return url.startsWith("http://") || url.startsWith("https://");
  }
}

/**
 * Check if a URL is a data URI (base64 image).
 */
function isDataUri(url: string): boolean {
  return url.startsWith("data:");
}

/**
 * Proxy an external image URL through the server.
 * Internal images and data URIs are returned as-is.
 *
 * @param imageUrl - The image URL to potentially proxy
 * @param maxAge - Optional cache max-age in seconds (default: 86400 = 1 day)
 * @returns The proxied URL if external, or the original URL if internal/data URI
 */
export function getProxiedImageUrl(
  imageUrl: string | null | undefined,
  maxAge: number = 86400,
): string | null | undefined {
  // Return null/undefined as-is
  if (!imageUrl) {
    return imageUrl;
  }

  // Don't proxy data URIs
  if (isDataUri(imageUrl)) {
    return imageUrl;
  }

  // Don't proxy internal/same-origin URLs
  if (!isExternalUrl(imageUrl)) {
    return imageUrl;
  }

  // Proxy external URLs
  const encodedUrl = encodeURIComponent(imageUrl);
  return `/api/image-proxy?url=${encodedUrl}&maxAge=${maxAge}`;
}
