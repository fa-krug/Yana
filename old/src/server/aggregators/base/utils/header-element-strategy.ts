/**
 * Strategy pattern for header element creation from URLs.
 * Provides extensible architecture for handling different URL types.
 */

import { logger } from "@server/utils/logger";

import { ArticleSkipError } from "../exceptions";

/**
 * Context passed to header element strategies.
 */
export interface HeaderElementContext {
  /** URL to create header element from */
  url: string;
  /** Alt text for image elements */
  alt: string;
}

/**
 * Strategy interface for creating header elements from URLs.
 * Each implementation handles a specific URL type (Reddit, YouTube, images, etc.).
 */
export interface HeaderElementStrategy {
  /**
   * Check if this strategy can handle the given URL.
   * @param url - URL to check
   * @returns true if this strategy can handle the URL
   */
  canHandle(url: string): boolean;

  /**
   * Create header element HTML from URL.
   *
   * @param context - Context containing URL and alt text
   * @returns HTML string for header element, or null if extraction fails
   * @throws {ArticleSkipError} For 4xx HTTP errors that should skip the article
   */
  create(context: HeaderElementContext): Promise<string | null>;
}

/**
 * Orchestrator that chains header element strategies.
 * Tries strategies in order until one successfully creates an element.
 */
export class HeaderElementOrchestrator {
  private strategies: HeaderElementStrategy[];

  /**
   * Create orchestrator with ordered list of strategies.
   * @param strategies - Strategies to try, in priority order
   */
  constructor(strategies: HeaderElementStrategy[]) {
    this.strategies = strategies;
  }

  /**
   * Create header element by trying strategies in order.
   *
   * @param url - URL to create element from
   * @param alt - Alt text for image elements
   * @returns HTML string, or null if all strategies fail
   * @throws {ArticleSkipError} If a strategy throws this error (4xx HTTP errors)
   */
  async create(url: string, alt: string): Promise<string | null> {
    if (!url) {
      return null;
    }

    const context: HeaderElementContext = { url, alt };

    for (const strategy of this.strategies) {
      if (!strategy.canHandle(url)) {
        continue;
      }

      try {
        const result = await strategy.create(context);
        if (result) {
          return result;
        }
      } catch (error) {
        // ArticleSkipError should propagate (4xx errors)
        if (error instanceof ArticleSkipError) {
          throw error;
        }

        // Other errors: log and continue to next strategy
        logger.debug(
          { error, url, strategy: strategy.constructor.name },
          "Strategy failed, trying next",
        );
      }
    }

    return null;
  }
}
