/**
 * Image extraction strategy pattern.
 *
 * Defines the interface for image extraction strategies and provides
 * an orchestrator that chains multiple strategies together.
 */

import type * as cheerio from "cheerio";
import type { Browser, Page } from "playwright";

/**
 * Context passed to image extraction strategies.
 */
export interface ImageExtractionContext {
  url: string;
  isHeaderImage?: boolean;
  page?: Page;
  html?: string;
  $?: cheerio.CheerioAPI;
  browser?: Browser;
}

/**
 * Result of image extraction.
 */
export interface ImageExtractionResult {
  imageData: Buffer;
  contentType: string;
}

/**
 * Strategy for extracting images from URLs.
 */
export interface ImageStrategy {
  /**
   * Check if this strategy can handle the given URL.
   */
  canHandle(url: string): boolean;

  /**
   * Extract image from the given context.
   * Returns null if no image could be extracted (continue to next strategy).
   * Throws ArticleSkipError for 4xx errors that should skip the article.
   * Throws other errors for unexpected failures.
   */
  extract(
    context: ImageExtractionContext,
  ): Promise<ImageExtractionResult | null>;
}

/**
 * Orchestrates multiple image extraction strategies.
 * Tries each strategy in order until one succeeds.
 */
export class ImageExtractionOrchestrator {
  constructor(private strategies: ImageStrategy[]) {}

  /**
   * Extract image using the configured strategies.
   */
  async extract(
    context: ImageExtractionContext,
  ): Promise<ImageExtractionResult | null> {
    for (const strategy of this.strategies) {
      if (!strategy.canHandle(context.url)) {
        continue;
      }

      try {
        const result = await strategy.extract(context);
        if (result) {
          return result;
        }
      } catch (error) {
        // ArticleSkipError should propagate
        if (error instanceof Error && error.name === "ArticleSkipError") {
          throw error;
        }
        // Other errors: log and continue to next strategy
      }
    }

    return null;
  }
}
