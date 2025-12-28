/**
 * Concrete image extraction strategy implementations.
 *
 * Each strategy handles a specific image source (direct files, YouTube, Twitter, etc.)
 */

import type {
  ImageExtractionContext,
  ImageExtractionResult,
  ImageStrategy,
} from "./image-strategy";
import {
  handleDirectImageUrl,
  handleYouTubeThumbnail,
  handleTwitterImage,
  handleMetaTagImage,
  handleInlineSvg,
  handlePageImages,
} from "./strategies/index";

/**
 * Strategy for direct image file URLs (.jpg, .png, etc.)
 */
export class DirectImageStrategy implements ImageStrategy {
  canHandle(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      const urlPath = parsedUrl.pathname.toLowerCase();
      return [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"].some(
        (ext) => urlPath.endsWith(ext),
      );
    } catch {
      return false;
    }
  }

  async extract(
    context: ImageExtractionContext,
  ): Promise<ImageExtractionResult | null> {
    return await handleDirectImageUrl(
      context.url,
      context.isHeaderImage ?? false,
    );
  }
}

/**
 * Strategy for YouTube video URLs.
 */
export class YouTubeStrategy implements ImageStrategy {
  canHandle(url: string): boolean {
    return /youtube\.com|youtu\.be/.test(url);
  }

  async extract(
    context: ImageExtractionContext,
  ): Promise<ImageExtractionResult | null> {
    return await handleYouTubeThumbnail(context.url);
  }
}

/**
 * Strategy for Twitter/X.com URLs.
 */
export class TwitterStrategy implements ImageStrategy {
  canHandle(url: string): boolean {
    return /twitter\.com|x\.com/.test(url);
  }

  async extract(
    context: ImageExtractionContext,
  ): Promise<ImageExtractionResult | null> {
    return await handleTwitterImage(context.url);
  }
}

/**
 * Strategy for meta tag extraction (og:image, twitter:image).
 * Requires page content to be loaded.
 */
export class MetaTagStrategy implements ImageStrategy {
  canHandle(_url: string): boolean {
    // This strategy needs the page to be loaded, so it always returns true
    // but only works if $ is provided in context
    return true;
  }

  async extract(
    context: ImageExtractionContext,
  ): Promise<ImageExtractionResult | null> {
    if (!context.$) {
      return null;
    }

    const $ = context.$;
    const isHeaderImage = context.isHeaderImage ?? false;

    // Try og:image meta tag
    const ogImage = $('meta[property="og:image"]').attr("content");
    if (ogImage) {
      const result = await handleMetaTagImage(
        ogImage,
        context.url,
        isHeaderImage,
      );
      if (result) return result;
    }

    // Try twitter:image meta tag
    const twitterImage = $('meta[name="twitter:image"]').attr("content");
    if (twitterImage) {
      const result = await handleMetaTagImage(
        twitterImage,
        context.url,
        isHeaderImage,
      );
      if (result) return result;
    }

    return null;
  }
}

/**
 * Strategy for inline SVG elements.
 * Requires Playwright page to be loaded.
 */
export class InlineSvgStrategy implements ImageStrategy {
  canHandle(_url: string): boolean {
    // Requires page to be loaded
    return true;
  }

  async extract(
    context: ImageExtractionContext,
  ): Promise<ImageExtractionResult | null> {
    if (!context.page || !context.$ || !context.html) {
      return null;
    }

    return await handleInlineSvg(
      context.page,
      context.$,
      context.html,
      context.url,
      context.isHeaderImage ?? false,
    );
  }
}

/**
 * Strategy for page images (SVG files and other images on the page).
 * Requires page content to be loaded.
 */
export class PageImagesStrategy implements ImageStrategy {
  canHandle(_url: string): boolean {
    // This strategy works for any URL that has page content
    return true;
  }

  async extract(
    context: ImageExtractionContext,
  ): Promise<ImageExtractionResult | null> {
    if (!context.$) {
      return null;
    }

    return await handlePageImages(
      context.$,
      context.url,
      context.isHeaderImage ?? false,
    );
  }
}
