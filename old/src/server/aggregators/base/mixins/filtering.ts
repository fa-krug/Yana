/**
 * Article filtering mixin for BaseAggregator.
 */

import type pino from "pino";

import type { RawArticle } from "../types";

/**
 * Interface for aggregator with filtering functionality.
 */
export interface FilteringMixin {
  readonly id: string;
  readonly feed: { id: number } | null;
  readonly logger: pino.Logger;
  isExistingUrl(url: string): boolean;
  shouldSkipArticle(article: RawArticle): boolean;
  applyArticleFilters(articles: RawArticle[]): Promise<RawArticle[]>;
  applyArticleLimit(articles: RawArticle[]): Promise<RawArticle[]>;
}

/**
 * Check if article should be skipped.
 * Override for custom skip logic.
 */
export function shouldSkipArticle(
  this: FilteringMixin,
  article: RawArticle,
): boolean {
  // Default: check if URL already exists
  return this.isExistingUrl(article.url);
}

/**
 * Apply article filters (title/content filters).
 * Override for custom filtering.
 */
export async function applyArticleFilters(
  this: FilteringMixin,
  articles: RawArticle[],
): Promise<RawArticle[]> {
  // Default: no filtering
  return articles;
}

/**
 * Apply article limit.
 * Override for custom limit logic.
 */
export async function applyArticleLimit(
  this: FilteringMixin,
  articles: RawArticle[],
): Promise<RawArticle[]> {
  // Default: no limit
  return articles;
}

/**
 * Filter articles (skip logic, filters, limits).
 * Override for custom filtering.
 */
export async function filterArticles(
  this: FilteringMixin,
  articles: RawArticle[],
): Promise<RawArticle[]> {
  const startTime = Date.now();
  this.logger.info(
    {
      step: "filterArticles",
      subStep: "start",
      aggregator: this.id,
      feedId: this.feed?.id,
      initialCount: articles.length,
    },
    "Filtering articles",
  );

  let filtered = articles;

  // Apply skip logic
  filtered = filtered.filter((article) => {
    const shouldSkip = this.shouldSkipArticle(article);
    if (shouldSkip) {
      this.logger.debug(
        {
          step: "filterArticles",
          subStep: "shouldSkipArticle",
          aggregator: this.id,
          feedId: this.feed?.id,
          url: article.url,
          title: article.title,
        },
        "Article skipped",
      );
    }
    return !shouldSkip;
  });

  // Apply article filters
  filtered = await this.applyArticleFilters(filtered);

  // Apply article limit
  filtered = await this.applyArticleLimit(filtered);

  const elapsed = Date.now() - startTime;
  this.logger.info(
    {
      step: "filterArticles",
      subStep: "complete",
      aggregator: this.id,
      feedId: this.feed?.id,
      initialCount: articles.length,
      filteredCount: filtered.length,
      elapsed,
    },
    "Article filtering complete",
  );

  return filtered;
}
