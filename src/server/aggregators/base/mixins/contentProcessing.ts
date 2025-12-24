/**
 * Content processing mixin for BaseAggregator.
 */

import type pino from "pino";

import type { Feed } from "@server/db/types";

import type { RawArticle } from "../types";

/**
 * Interface for aggregator with content processing functionality.
 */
export interface ContentProcessingMixin {
  readonly id: string;
  readonly feed: Feed | null;
  readonly selectorsToRemove: string[];
  readonly logger: pino.Logger;
  removeElementsBySelectors(html: string, article: RawArticle): Promise<string>;
}

/**
 * Extract content from HTML.
 * Override for custom extraction.
 */
export async function extractContent(
  this: ContentProcessingMixin,
  html: string,
  article: RawArticle,
): Promise<string> {
  const { extractContent } = await import("../extract");
  let extracted = extractContent(html, {
    selectorsToRemove: this.selectorsToRemove,
  });

  // Remove elements by selectors
  extracted = await this.removeElementsBySelectors(extracted, article);

  return extracted;
}

/**
 * Remove elements by CSS selectors.
 * Override for custom selector removal.
 */
export async function removeElementsBySelectors(
  this: ContentProcessingMixin,
  html: string,
  _article: RawArticle,
): Promise<string> {
  const { removeElementsBySelectors } = await import("../utils");
  return removeElementsBySelectors(html, this.selectorsToRemove);
}

/**
 * Validate content quality.
 * Returns false to skip article.
 * Override for custom validation.
 */
export function validateContent(
  this: ContentProcessingMixin,
  content: string,
  article: RawArticle,
): boolean {
  // Default validation: check if content is not empty and has minimum length
  if (!content || content.trim().length === 0) {
    this.logger.debug(
      {
        step: "enrichArticles",
        subStep: "validateContent",
        aggregator: this.id,
        feedId: this.feed?.id,
        url: article.url,
        reason: "empty_content",
      },
      "Content validation failed: empty content",
    );
    return false;
  }

  return true;
}

/**
 * Process content (sanitize, transform, standardize).
 * Override for custom processing.
 */
export async function processContent(
  this: ContentProcessingMixin,
  html: string,
  article: RawArticle,
): Promise<string> {
  // Default: use standardizeContentFormat
  const { processContent: processContentUtil } = await import("../process");
  const { sanitizeHtml } = await import("../utils");

  // Sanitize HTML (remove scripts, rename attributes)
  const sanitized = sanitizeHtml(html);

  // Process content (standardize format with images and source link)
  const generateTitleImage = this.feed?.generateTitleImage ?? true;
  const addSourceFooter = this.feed?.addSourceFooter ?? true;
  return await processContentUtil(
    sanitized,
    article,
    generateTitleImage,
    addSourceFooter,
  );
}

/**
 * Extract and process images.
 * Override for custom image extraction.
 */
export async function extractImages(
  this: ContentProcessingMixin,
  _content: string,
  _article: RawArticle,
): Promise<void> {
  // Default: no image extraction
  // Images are handled in processContent via standardizeContentFormat
}

/**
 * Process article content.
 * Can be overridden by subclasses.
 */
export async function processArticle(
  this: ContentProcessingMixin,
  article: RawArticle,
): Promise<string> {
  // Default: return content as-is
  return article.content || article.summary || "";
}

/**
 * Finalize articles (deduplication, sorting, validation).
 * Override for custom finalization.
 */
export async function finalizeArticles(
  this: ContentProcessingMixin,
  articles: RawArticle[],
): Promise<RawArticle[]> {
  const startTime = Date.now();
  this.logger.debug(
    {
      step: "finalizeArticles",
      subStep: "start",
      aggregator: this.id,
      feedId: this.feed?.id,
      articleCount: articles.length,
    },
    "Finalizing articles",
  );

  // Default: sort by published date (newest first)
  const finalized = articles.sort((a, b) => {
    return b.published.getTime() - a.published.getTime();
  });

  const elapsed = Date.now() - startTime;
  this.logger.debug(
    {
      step: "finalizeArticles",
      subStep: "complete",
      aggregator: this.id,
      feedId: this.feed?.id,
      articleCount: finalized.length,
      elapsed,
    },
    "Article finalization complete",
  );

  return finalized;
}
