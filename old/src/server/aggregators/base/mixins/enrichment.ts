/**
 * Article enrichment mixin for BaseAggregator.
 */

import type pino from "pino";

import { ArticleSkipError } from "../exceptions";
import type { RawArticle } from "../types";
import { EnrichmentPipeline } from "../utils/enrichmentPipeline";

/**
 * Interface for aggregator with enrichment functionality.
 */
export interface EnrichmentMixin {
  readonly id: string;
  readonly feed: { id: number } | null;
  readonly logger: pino.Logger;
  shouldFetchContent(article: RawArticle): boolean;
  getCachedContent(article: RawArticle): Promise<string | null>;
  fetchArticleContentInternal(
    url: string,
    article: RawArticle,
  ): Promise<string>;
  extractContent(html: string, article: RawArticle): Promise<string>;
  validateContent(content: string, article: RawArticle): boolean;
  processContent(html: string, article: RawArticle): Promise<string>;
  extractImages(content: string, article: RawArticle): Promise<void>;
  setCachedContent(article: RawArticle, content: string): Promise<void>;
}

/**
 * Enrich articles (fetch content, extract, process).
 * Override for custom enrichment logic.
 */
export async function enrichArticles(
  this: EnrichmentMixin,
  articles: RawArticle[],
): Promise<RawArticle[]> {
  const startTime = Date.now();
  const totalArticles = articles.length;
  this.logger.info(
    {
      step: "enrichArticles",
      subStep: "start",
      aggregator: this.id,
      feedId: this.feed?.id,
      articleCount: totalArticles,
    },
    "Enriching articles",
  );

  const enriched: RawArticle[] = [];

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const articleStart = Date.now();
    const progress = `${i + 1}/${totalArticles}`;

    try {
      this.logger.debug(
        {
          step: "enrichArticles",
          subStep: "processArticle",
          aggregator: this.id,
          feedId: this.feed?.id,
          progress,
          url: article.url,
          title: article.title,
        },
        `Processing article ${i + 1}/${totalArticles}`,
      );

      // Run enrichment pipeline
      const pipeline = new EnrichmentPipeline(this, article, this.logger);
      const result = await pipeline.run();

      if (!result) {
        // Article was skipped (content not needed or cache check passed without fetching)
        enriched.push(article);
      } else {
        // Pipeline processed the article
        article.content = result.content;

        // Cache processed content if not from cache
        if (!result.fromCache) {
          await this.setCachedContent(article, result.content);
        }

        enriched.push(article);
      }

      const articleElapsed = Date.now() - articleStart;
      this.logger.debug(
        {
          step: "enrichArticles",
          subStep: "processArticle",
          aggregator: this.id,
          feedId: this.feed?.id,
          progress,
          url: article.url,
          elapsed: articleElapsed,
        },
        `Article ${i + 1} processed`,
      );
    } catch (error) {
      // Check for ArticleSkipError (4xx errors) - skip article entirely
      if (error instanceof ArticleSkipError) {
        this.logger.warn(
          {
            step: "enrichArticles",
            subStep: "processArticle",
            aggregator: this.id,
            feedId: this.feed?.id,
            progress,
            url: article.url,
            statusCode: error.statusCode,
            skipped: true,
          },
          "4xx error processing article, skipping",
        );
        continue;
      }
      this.logger.error(
        {
          step: "enrichArticles",
          subStep: "processArticle",
          aggregator: this.id,
          feedId: this.feed?.id,
          progress,
          url: article.url,
          error: error instanceof Error ? error : new Error(String(error)),
        },
        "Error processing article",
      );
      // Continue with next article
      continue;
    }
  }

  const elapsed = Date.now() - startTime;
  this.logger.info(
    {
      step: "enrichArticles",
      subStep: "complete",
      aggregator: this.id,
      feedId: this.feed?.id,
      initialCount: totalArticles,
      enrichedCount: enriched.length,
      elapsed,
    },
    "Article enrichment complete",
  );

  return enriched;
}
