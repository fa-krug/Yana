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

/**
 * Generate responsive image srcset for better performance.
 * Returns srcset string with multiple image sizes.
 *
 * @param imageUrl - The base image URL
 * @param sizes - Array of width sizes in pixels (e.g., [300, 600, 1200])
 * @returns srcset string or null if imageUrl is invalid
 */
export function getResponsiveImageSrcset(
  imageUrl: string | null | undefined,
  sizes: number[] = [300, 600, 1200],
): string | null {
  if (!imageUrl) {
    return null;
  }

  // For proxied images, we can't easily generate multiple sizes
  // Return the proxied URL as a single srcset entry
  const proxiedUrl = getProxiedImageUrl(imageUrl);
  if (!proxiedUrl) {
    return null;
  }

  // If it's a data URI or internal URL, return as-is
  if (isDataUri(imageUrl) || !isExternalUrl(imageUrl)) {
    return `${imageUrl} ${sizes[0]}w`;
  }

  // For external images, return proxied URL with largest size
  // Note: The image proxy would need to support size parameters for full responsive support
  return `${proxiedUrl} ${sizes[sizes.length - 1]}w`;
}

/**
 * Get image sizes attribute for responsive images.
 *
 * @param defaultSize - Default size for the image (e.g., "300px" or "(max-width: 600px) 300px, 600px")
 * @returns sizes attribute value
 */
export function getImageSizes(defaultSize: string = "300px"): string {
  return `(max-width: 600px) 300px, (max-width: 1200px) 600px, ${defaultSize}`;
}
