/**
 * Fetch utilities for aggregators.
 */

import Parser from 'rss-parser';
import { chromium, type Browser } from 'playwright';
import { logger } from '../../utils/logger';
import { ContentFetchError } from './exceptions';

let browser: Browser | null = null;

/**
 * Get or create browser instance.
 */
async function getBrowser(): Promise<Browser> {
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
  options: { timeout?: number } = {}
): Promise<Parser.Output<any>> {
  const startTime = Date.now();
  const { timeout = 25000 } = options; // Default 25s, leaving 5s buffer for the 30s preview timeout

  logger.info(
    {
      feedUrl,
      timeout,
      step: 'fetchFeed_start',
    },
    'Starting RSS feed fetch'
  );

  try {
    // Use custom request function with timeout support
    const parserInitStart = Date.now();
    const parserWithTimeout = new Parser({
      timeout,
      requestOptions: {
        timeout,
      },
    });
    logger.debug(
      {
        feedUrl,
        elapsed: Date.now() - parserInitStart,
        step: 'parser_init',
      },
      'Parser initialized with timeout'
    );

    const parseStart = Date.now();
    logger.info(
      {
        feedUrl,
        step: 'parseURL_start',
      },
      'Calling parser.parseURL'
    );

    const feed = await parserWithTimeout.parseURL(feedUrl);

    const parseElapsed = Date.now() - parseStart;
    const totalElapsed = Date.now() - startTime;

    logger.info(
      {
        feedUrl,
        itemCount: feed.items?.length || 0,
        parseElapsed,
        totalElapsed,
        step: 'fetchFeed_complete',
      },
      'RSS feed fetched and parsed successfully'
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
        step: 'fetchFeed_error',
        errorMessage: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : 'Unknown',
      },
      'Failed to fetch RSS feed'
    );
    throw error;
  }
}

/**
 * Fetch article content using Playwright with retry logic.
 */
export async function fetchArticleContent(
  url: string,
  options: {
    timeout?: number;
    waitForSelector?: string;
    maxRetries?: number;
  } = {}
): Promise<string> {
  const { timeout = 30000, waitForSelector, maxRetries = 3 } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const browserInstance = await getBrowser();
      const page = await browserInstance.newPage();

      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout });

        if (waitForSelector) {
          await page.waitForSelector(waitForSelector, { timeout });
        }

        const html = await page.content();
        await page.close();
        return html;
      } catch (error) {
        await page.close();
        throw error;
      }
    } catch (error) {
      lastError = error as Error;

      // Check if should retry
      const { shouldRetry, getRetryDelay } = await import('./errorHandler');
      if (shouldRetry(error) && attempt < maxRetries - 1) {
        const delay = getRetryDelay(attempt);
        logger.warn(
          {
            error: error instanceof Error ? error : new Error(String(error)),
            url,
            attempt: attempt + 1,
            delay,
          },
          'Retrying fetch after delay'
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Don't retry or max retries reached
      const errorMessage =
        lastError instanceof Error ? lastError.message : String(lastError || 'Unknown error');
      logger.error(
        {
          error: error instanceof Error ? error : new Error(String(error)),
          url,
          attempt: attempt + 1,
        },
        'Failed to fetch article content'
      );
      throw new ContentFetchError(
        `Failed to fetch content from ${url}: ${errorMessage}`,
        undefined,
        lastError
      );
    }
  }

  const finalErrorMessage =
    lastError instanceof Error ? lastError.message : String(lastError || 'Unknown error');
  throw new ContentFetchError(
    `Failed to fetch content from ${url} after ${maxRetries} attempts: ${finalErrorMessage}`,
    undefined,
    lastError || undefined
  );
}

/**
 * Close browser instance.
 */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
