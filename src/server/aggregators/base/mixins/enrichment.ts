/**
 * Article enrichment mixin for BaseAggregator.
 */

import type { RawArticle } from "../types";

/**
 * Interface for aggregator with enrichment functionality.
 */
export interface EnrichmentMixin {
  readonly id: string;
  readonly feed: { id: number } | null;
  readonly logger: any;
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

    try {
      this.logger.debug(
        {
          step: "enrichArticles",
          subStep: "processArticle",
          aggregator: this.id,
          feedId: this.feed?.id,
          progress: `${i + 1}/${totalArticles}`,
          url: article.url,
          title: article.title,
        },
        `Processing article ${i + 1}/${totalArticles}`,
      );

      // Check if content should be fetched
      if (!this.shouldFetchContent(article)) {
        this.logger.debug(
          {
            step: "enrichArticles",
            subStep: "shouldFetchContent",
            aggregator: this.id,
            feedId: this.feed?.id,
            url: article.url,
            skip: true,
          },
          "Skipping content fetch",
        );
        enriched.push(article);
        continue;
      }

      // Try to get cached content
      let html: string | null = await this.getCachedContent(article);
      let fromCache = false;

      if (html) {
        fromCache = true;
        this.logger.debug(
          {
            step: "enrichArticles",
            subStep: "getCachedContent",
            aggregator: this.id,
            feedId: this.feed?.id,
            url: article.url,
            cached: true,
          },
          "Using cached content",
        );
      } else {
        // Fetch article content
        try {
          html = await this.fetchArticleContentInternal(article.url, article);
          this.logger.debug(
            {
              step: "enrichArticles",
              subStep: "fetchArticleContent",
              aggregator: this.id,
              feedId: this.feed?.id,
              url: article.url,
              cached: false,
            },
            "Fetched article content",
          );
        } catch (error) {
          this.logger.warn(
            {
              step: "enrichArticles",
              subStep: "fetchArticleContent",
              aggregator: this.id,
              feedId: this.feed?.id,
              url: article.url,
              error: error instanceof Error ? error : new Error(String(error)),
              fallback: "summary",
            },
            "Failed to fetch content, using summary",
          );
          // Fallback to summary
          article.content = article.summary || "";
          enriched.push(article);
          continue;
        }
      }

      // Extract content
      let extracted: string;
      try {
        extracted = await this.extractContent(html, article);
      } catch (error) {
        this.logger.warn(
          {
            step: "enrichArticles",
            subStep: "extractContent",
            aggregator: this.id,
            feedId: this.feed?.id,
            url: article.url,
            error: error instanceof Error ? error : new Error(String(error)),
            fallback: "original",
          },
          "Failed to extract content, using original HTML",
        );
        extracted = html;
      }

      // Validate content
      const isValid = this.validateContent(extracted, article);
      if (!isValid) {
        this.logger.warn(
          {
            step: "enrichArticles",
            subStep: "validateContent",
            aggregator: this.id,
            feedId: this.feed?.id,
            url: article.url,
            valid: false,
            skipped: true,
          },
          "Content validation failed, skipping article",
        );
        continue;
      }

      // Process content
      let processed: string;
      try {
        processed = await this.processContent(extracted, article);
      } catch (error) {
        this.logger.warn(
          {
            step: "enrichArticles",
            subStep: "processContent",
            aggregator: this.id,
            feedId: this.feed?.id,
            url: article.url,
            error: error instanceof Error ? error : new Error(String(error)),
            fallback: "extracted",
          },
          "Failed to process content, using extracted content",
        );
        processed = extracted;
      }

      // Extract images (optional)
      try {
        await this.extractImages(processed, article);
      } catch (error) {
        this.logger.debug(
          {
            step: "enrichArticles",
            subStep: "extractImages",
            aggregator: this.id,
            feedId: this.feed?.id,
            url: article.url,
            error: error instanceof Error ? error : new Error(String(error)),
          },
          "Image extraction failed (non-critical)",
        );
      }

      article.content = processed;

      // Cache processed content
      if (!fromCache) {
        await this.setCachedContent(article, processed);
      }

      const articleElapsed = Date.now() - articleStart;
      this.logger.debug(
        {
          step: "enrichArticles",
          subStep: "processArticle",
          aggregator: this.id,
          feedId: this.feed?.id,
          progress: `${i + 1}/${totalArticles}`,
          url: article.url,
          elapsed: articleElapsed,
        },
        `Article ${i + 1} processed`,
      );

      enriched.push(article);
    } catch (error) {
      this.logger.error(
        {
          step: "enrichArticles",
          subStep: "processArticle",
          aggregator: this.id,
          feedId: this.feed?.id,
          progress: `${i + 1}/${totalArticles}`,
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
