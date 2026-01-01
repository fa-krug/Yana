/**
 * Utility functions for aggregators.
 * Re-exports all utility modules.
 */

// YouTube utilities
export { extractYouTubeVideoId, getYouTubeProxyUrl } from "./youtube";

// Twitter/X utilities
export { isTwitterUrl, extractTweetId, normalizeTwitterUrl } from "./twitter";

// Image utilities
export { extractImageFromUrl, fetchSingleImage } from "./images/index";

// Image compression utilities
export {
  compressImage,
  MAX_HEADER_IMAGE_WIDTH,
  MAX_HEADER_IMAGE_HEIGHT,
} from "./compression";

// HTML utilities
export { removeElementsBySelectors, sanitizeHtml } from "./html";

// Thumbnail utilities
export {
  convertThumbnailUrlToBase64,
  extractThumbnailUrlFromPage,
  extractThumbnailUrlFromPageAndConvertToBase64,
  extractBase64ImageFromContent,
} from "./thumbnails";

// Header element utilities
export { createHeaderElementFromUrl } from "./header-element";
