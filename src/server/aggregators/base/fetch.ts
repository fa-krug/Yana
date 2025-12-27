/**
 * Fetch utilities for aggregators.
 */

import axios from "axios";
import { chromium, type Browser } from "playwright";
import Parser from "rss-parser";

import { logger } from "@server/utils/logger";

import { ContentFetchError, ArticleSkipError } from "./exceptions";
import { is4xxError } from "./utils/http-errors";

let browser: Browser | null = null;

/**
 * Get or create browser instance.
 */
export async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
    });
  }
  return browser;
}

/**
 * Fetch and parse RSS feed.
 */
export async function fetchFeed(
  feedUrl: string,
  options: { timeout?: number } = {},
): Promise<Parser.Output<unknown>> {
  const startTime = Date.now();
  const { timeout = 25000 } = options; // Default 25s for RSS feed fetching

  logger.info(
    {
      feedUrl,
      timeout,
      step: "fetchFeed_start",
    },
    "Starting RSS feed fetch",
  );

  try {
    // Fetch feed content using axios (avoids deprecated url.parse() in rss-parser)
    const fetchStart = Date.now();
    logger.info(
      {
        feedUrl,
        step: "fetch_start",
      },
      "Fetching RSS feed content",
    );

    const response = await axios.get(feedUrl, {
      timeout,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RSS Reader)",
      },
      responseType: "text",
    });

    const fetchElapsed = Date.now() - fetchStart;
    logger.debug(
      {
        feedUrl,
        elapsed: fetchElapsed,
        step: "fetch_complete",
      },
      "RSS feed content fetched",
    );

    // Parse feed content using parseString (avoids deprecated url.parse() path)
    const parserInitStart = Date.now();
    const parser = new Parser();
    logger.debug(
      {
        feedUrl,
        elapsed: Date.now() - parserInitStart,
        step: "parser_init",
      },
      "Parser initialized",
    );

    const parseStart = Date.now();
    logger.info(
      {
        feedUrl,
        step: "parseString_start",
      },
      "Calling parser.parseString",
    );

    const feed = await parser.parseString(response.data);

    const parseElapsed = Date.now() - parseStart;
    const totalElapsed = Date.now() - startTime;

    logger.info(
      {
        feedUrl,
        itemCount: feed.items?.length || 0,
        parseElapsed,
        totalElapsed,
        step: "fetchFeed_complete",
      },
      "RSS feed fetched and parsed successfully",
    );

    return feed;
  } catch (error) {
    const totalElapsed = Date.now() - startTime;
    logger.error(
      {
        error: error instanceof Error ? error : new Error(String(error)),
        feedUrl,
        timeout,
        totalElapsed,
        step: "fetchFeed_error",
        errorMessage: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : "Unknown",
      },
      "Failed to fetch RSS feed",
    );
    throw error;
  }
}

/**
 * Fetch article content using Playwright.
 * Fail-fast implementation (no retries) - errors are handled by the aggregator template method.
 */
export async function fetchArticleContent(
  url: string,
  options: {
    timeout?: number;
    waitForSelector?: string;
  } = {},
): Promise<string> {
  const { timeout = 30000, waitForSelector } = options;
  const startTime = Date.now();

  logger.debug(
    {
      url,
      timeout,
      waitForSelector,
      step: "fetchArticleContent",
      subStep: "start",
    },
    "Fetching article content",
  );

  try {
    const browserInstance = await getBrowser();
    const page = await browserInstance.newPage();

    try {
      // Always use domcontentloaded for faster, more reliable loading
      await page.goto(url, { waitUntil: "domcontentloaded", timeout });

      if (waitForSelector) {
        await page.waitForSelector(waitForSelector, { timeout });
      }

      const html = await page.content();
      await page.close();

      const elapsed = Date.now() - startTime;
      logger.debug(
        {
          url,
          elapsed,
          step: "fetchArticleContent",
          subStep: "complete",
        },
        "Article content fetched successfully",
      );

      return html;
    } catch (error) {
      await page.close();
      throw error;
    }
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : String(error || "Unknown error");

    // Check for 4xx errors - Playwright may throw errors with status information
    // Check if it's an axios error first (from redirects or other HTTP calls)
    const statusCode = is4xxError(error);
    if (statusCode !== null) {
      logger.warn(
        {
          error: error instanceof Error ? error : new Error(String(error)),
          url,
          elapsed,
          statusCode,
          step: "fetchArticleContent",
          subStep: "error",
        },
        "4xx error fetching article content, skipping article",
      );
      throw new ArticleSkipError(
        `Failed to fetch content from ${url}: ${statusCode} ${errorMessage}`,
        undefined,
        statusCode,
        error instanceof Error ? error : undefined,
      );
    }

    // Check for Playwright navigation errors that might indicate 4xx
    // Playwright throws errors with messages like "net::ERR_ABORTED" or status codes
    if (error instanceof Error) {
      const errorMsg = error.message.toLowerCase();
      // Check for common 4xx indicators in Playwright errors
      if (
        errorMsg.includes("404") ||
        errorMsg.includes("403") ||
        errorMsg.includes("401") ||
        errorMsg.includes("410") ||
        errorMsg.includes("net::err_aborted")
      ) {
        // Try to extract status code from error message
        const statusMatch = /\b(40\d|41\d)\b/.exec(errorMsg);
        const extractedStatus = statusMatch
          ? parseInt(statusMatch[1], 10)
          : null;
        if (
          extractedStatus &&
          extractedStatus >= 400 &&
          extractedStatus < 500
        ) {
          logger.warn(
            {
              error,
              url,
              elapsed,
              statusCode: extractedStatus,
              step: "fetchArticleContent",
              subStep: "error",
            },
            "4xx error fetching article content (detected from Playwright error), skipping article",
          );
          throw new ArticleSkipError(
            `Failed to fetch content from ${url}: ${extractedStatus} ${errorMessage}`,
            undefined,
            extractedStatus,
            error,
          );
        }
      }
    }

    logger.error(
      {
        error: error instanceof Error ? error : new Error(String(error)),
        url,
        elapsed,
        step: "fetchArticleContent",
        subStep: "error",
        errorMessage,
      },
      "Failed to fetch article content",
    );

    throw new ContentFetchError(
      `Failed to fetch content from ${url}: ${errorMessage}`,
      undefined,
      error instanceof Error ? error : undefined,
    );
  }
}

/**
 * Close browser instance.
 */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    try {
      await browser.close();
      logger.info("Playwright browser closed");
    } catch (error) {
      logger.warn({ error }, "Error closing Playwright browser");
    } finally {
      browser = null;
    }
  }
}

// Register shutdown handlers to close browser on process exit
let shutdownHandlersRegistered = false;
function registerShutdownHandlers(): void {
  if (shutdownHandlersRegistered) return;
  shutdownHandlersRegistered = true;

  const cleanup = async () => {
    await closeBrowser();
  };

  // Handle graceful shutdown signals
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);

  // Handle process exit (less graceful, but ensures cleanup)
  process.on("exit", () => {
    // Synchronous cleanup on exit
    if (browser) {
      try {
        // Force close on exit (synchronous)
        browser.close().catch(() => {
          // Ignore errors during forced shutdown
        });
      } catch {
        // Ignore errors during forced shutdown
      }
    }
  });

  // Handle uncaught exceptions and unhandled rejections
  process.on("uncaughtException", async (error) => {
    logger.error({ error }, "Uncaught exception, closing browser");
    await cleanup();
  });

  process.on("unhandledRejection", async (reason) => {
    logger.error({ reason }, "Unhandled rejection, closing browser");
    await cleanup();
  });
}

// Register handlers when module is loaded
registerShutdownHandlers();
