/**
 * Article enrichment pipeline that orchestrates multi-step content processing
 * with unified error handling and fallback strategies.
 */

import type pino from "pino";

import { ArticleSkipError } from "../exceptions";
import type { EnrichmentMixin } from "../mixins/enrichment";
import type { RawArticle } from "../types";

import {
  EnrichmentErrorHandler,
  ErrorRecoveryAction,
  type ErrorContext,
} from "./enrichmentErrorHandler";

/**
 * Result of pipeline execution with processed content.
 */
export interface PipelineResult {
  content: string;
  fromCache: boolean;
}

/**
 * Orchestrates the enrichment process for a single article through multiple steps:
 * 1. Cache lookup
 * 2. Content fetching (if needed)
 * 3. Content extraction
 * 4. Content validation
 * 5. Content processing
 * 6. Image extraction (optional)
 * 7. Cache writing
 */
export class EnrichmentPipeline {
  private errorHandler: EnrichmentErrorHandler;

  constructor(
    private mixin: EnrichmentMixin,
    private article: RawArticle,
    private logger: pino.Logger,
  ) {
    this.errorHandler = new EnrichmentErrorHandler(logger);
  }

  /**
   * Run the full enrichment pipeline for the article.
   * Throws ArticleSkipError to signal article should be skipped.
   */
  async run(): Promise<PipelineResult | null> {
    const errorContext: ErrorContext = {
      step: "enrichArticles",
      aggregator: this.mixin.id,
      feedId: this.mixin.feed?.id,
      url: this.article.url,
      article: this.article,
    };

    try {
      // Step 1: Check if content should be fetched
      if (!this.mixin.shouldFetchContent(this.article)) {
        this.logger.debug(
          {
            step: "enrichArticles",
            subStep: "shouldFetchContent",
            aggregator: this.mixin.id,
            feedId: this.mixin.feed?.id,
            url: this.article.url,
            skip: true,
          },
          "Skipping content fetch",
        );
        return null;
      }

      // Step 2: Get or fetch HTML content
      const html = await this.getContentHtml(errorContext);
      if (!html) {
        // ArticleSkipError was already thrown/handled
        return null;
      }

      // Step 3: Extract content
      const extracted = await this.extractContent(html, errorContext);
      if (!extracted) {
        return null;
      }

      // Step 4: Validate content
      if (!this.mixin.validateContent(extracted, this.article)) {
        this.logger.warn(
          {
            step: "enrichArticles",
            subStep: "validateContent",
            aggregator: this.mixin.id,
            feedId: this.mixin.feed?.id,
            url: this.article.url,
            valid: false,
            skipped: true,
          },
          "Content validation failed, skipping article",
        );
        throw new ArticleSkipError(
          "Content validation failed",
          this.mixin.feed?.id,
        );
      }

      // Step 5: Process content
      const processed = await this.processContent(extracted, errorContext);
      if (!processed) {
        return null;
      }

      // Step 6: Extract images (optional, non-critical)
      await this.extractImagesOptional(processed, errorContext);

      return { content: processed, fromCache: false };
    } catch (error) {
      // ArticleSkipError propagates up to enrichArticles function
      if (error instanceof ArticleSkipError) {
        throw error;
      }

      // Unexpected errors should be caught at top level of enrichArticles
      throw error;
    }
  }

  /**
   * Get HTML content from cache or fetch it.
   */
  private async getContentHtml(
    errorContext: ErrorContext,
  ): Promise<string | null> {
    // Try cache first
    let html: string | null = await this.mixin.getCachedContent(this.article);
    if (html) {
      this.logger.debug(
        {
          step: "enrichArticles",
          subStep: "getCachedContent",
          aggregator: this.mixin.id,
          feedId: this.mixin.feed?.id,
          url: this.article.url,
          cached: true,
        },
        "Using cached content",
      );
      return html;
    }

    // Fetch from source
    try {
      html = await this.mixin.fetchArticleContentInternal(
        this.article.url,
        this.article,
      );
      this.logger.debug(
        {
          step: "enrichArticles",
          subStep: "fetchArticleContent",
          aggregator: this.mixin.id,
          feedId: this.mixin.feed?.id,
          url: this.article.url,
          cached: false,
        },
        "Fetched article content",
      );
      return html;
    } catch (error) {
      const action = this.errorHandler.handleError(
        error,
        errorContext,
        "fetch content",
      );

      if (action === ErrorRecoveryAction.SKIP) {
        throw error; // Rethrow ArticleSkipError
      }

      // Fallback to summary
      if (this.article.summary) {
        this.logger.debug(
          {
            step: "enrichArticles",
            subStep: "fetchArticleContent",
            aggregator: this.mixin.id,
            feedId: this.mixin.feed?.id,
            url: this.article.url,
            fallback: "summary",
          },
          "Failed to fetch content, using summary fallback",
        );
        return this.article.summary;
      }

      throw new ArticleSkipError(
        "Failed to fetch content and no summary fallback available",
        this.mixin.feed?.id,
      );
    }
  }

  /**
   * Extract content from HTML.
   */
  private async extractContent(
    html: string,
    errorContext: ErrorContext,
  ): Promise<string | null> {
    try {
      return await this.mixin.extractContent(html, this.article);
    } catch (error) {
      const action = this.errorHandler.handleError(
        error,
        errorContext,
        "extract content",
      );

      if (action === ErrorRecoveryAction.SKIP) {
        throw error; // Rethrow ArticleSkipError
      }

      // Fallback to original HTML
      return html;
    }
  }

  /**
   * Process extracted content.
   */
  private async processContent(
    extracted: string,
    errorContext: ErrorContext,
  ): Promise<string | null> {
    try {
      return await this.mixin.processContent(extracted, this.article);
    } catch (error) {
      const action = this.errorHandler.handleError(
        error,
        errorContext,
        "process content",
      );

      if (action === ErrorRecoveryAction.SKIP) {
        throw error; // Rethrow ArticleSkipError
      }

      // Fallback to extracted content
      return extracted;
    }
  }

  /**
   * Extract images (optional operation that shouldn't skip article).
   */
  private async extractImagesOptional(
    content: string,
    errorContext: ErrorContext,
  ): Promise<void> {
    try {
      await this.mixin.extractImages(content, this.article);
    } catch (error) {
      this.errorHandler.handleOptionalError(
        error,
        errorContext,
        "image extraction",
      );
    }
  }
}
