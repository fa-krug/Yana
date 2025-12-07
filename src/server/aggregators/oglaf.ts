/**
 * Oglaf aggregator.
 *
 * Adult webcomic featuring fantasy, humor, and occasional NSFW content.
 * Handles the age confirmation page automatically.
 */

import { BaseAggregator } from "./base/aggregator";
import type { RawArticle } from "./base/types";
import { fetchFeed } from "./base/fetch";
import { ContentFetchError } from "./base/exceptions";
import { chromium, type Browser, type Page } from "playwright";
import * as cheerio from "cheerio";
import { logger } from "../utils/logger";

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
 * Fetch Oglaf comic content, handling the age confirmation page.
 */
async function fetchOglafContent(
  url: string,
  timeout: number = 30000,
): Promise<string> {
  logger.info({ url }, "Fetching Oglaf content");

  const browserInstance = await getBrowser();
  const page: Page = await browserInstance.newPage();

  try {
    await page.setDefaultTimeout(timeout);

    // Navigate to URL
    await page.goto(url, { waitUntil: "networkidle", timeout });

    // Check if we're on a confirmation page and click the confirm button
    try {
      const confirmButton = await page.waitForSelector("#confirm", {
        timeout: 5000,
      });
      if (confirmButton) {
        logger.debug("Found confirmation page, clicking confirm button");
        await confirmButton.click();
        await page.waitForLoadState("networkidle");
      }
    } catch (error) {
      // No confirm button or already confirmed
      logger.debug(
        { error },
        "No age confirmation needed or already confirmed",
      );
    }

    // Get the page content
    const content = await page.content();
    return content;
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error : new Error(String(error)),
        url,
      },
      "Error fetching Oglaf content",
    );
    throw new ContentFetchError(
      `Failed to fetch Oglaf content from ${url}: ${error instanceof Error ? error.message : String(error)}`,
      undefined,
      error instanceof Error ? error : undefined,
    );
  } finally {
    await page.close();
  }
}

/**
 * Extract the comic image from Oglaf page HTML.
 */
function extractComicImage(html: string, articleUrl: string): string {
  try {
    const $ = cheerio.load(html);
    let comicImg = $("#strip");

    if (comicImg.length === 0) {
      comicImg = $(".content img, #content img, .comic img").first();
    }

    if (comicImg.length > 0) {
      const imgSrc = comicImg.attr("src") || "";
      const altText = comicImg.attr("alt") || "Oglaf comic";
      return `<img src="${imgSrc}" alt="${altText}">`;
    }

    logger.warn({ url: articleUrl }, "Could not find comic image");
    return `<p>Could not extract comic. <a href="${articleUrl}">View on Oglaf</a></p>`;
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error : new Error(String(error)),
        url: articleUrl,
      },
      "Extraction failed",
    );
    return `<p>Could not extract comic. <a href="${articleUrl}">View on Oglaf</a></p>`;
  }
}

export class OglafAggregator extends BaseAggregator {
  override readonly id: string = "oglaf";
  override readonly type: "managed" | "custom" | "social" = "managed";
  override readonly name: string = "Oglaf";
  override readonly url: string = "https://www.oglaf.com/feeds/rss/";
  override readonly description: string =
    "Oglaf - Adult webcomic featuring fantasy, humor, and occasional NSFW content.";

  async aggregate(articleLimit?: number): Promise<RawArticle[]> {
    const aggregateStart = Date.now();
    logger.info(
      {
        aggregator: this.id,
        feedId: this.feed?.id,
        articleLimit,
        step: "aggregate_start",
      },
      `Starting aggregation${articleLimit ? ` (limit: ${articleLimit})` : ""}`,
    );

    if (!this.feed) {
      throw new Error("Feed not initialized");
    }

    const feedUrl = this.feed.identifier;
    logger.info(
      {
        feedUrl,
        aggregator: this.id,
        step: "fetch_feed_start",
      },
      "Fetching RSS feed",
    );

    // Fetch RSS feed
    const feedFetchStart = Date.now();
    const feed = await fetchFeed(feedUrl);
    const feedFetchElapsed = Date.now() - feedFetchStart;

    logger.info(
      {
        feedUrl,
        itemCount: feed.items?.length || 0,
        elapsed: feedFetchElapsed,
        aggregator: this.id,
        step: "fetch_feed_complete",
      },
      "RSS feed fetched, processing items",
    );

    const articles: RawArticle[] = [];
    let itemsToProcess = feed.items || [];

    // Apply article limit if specified
    if (articleLimit !== undefined && articleLimit > 0) {
      itemsToProcess = itemsToProcess.slice(0, articleLimit);
      logger.info(
        {
          originalCount: feed.items?.length || 0,
          limitedCount: itemsToProcess.length,
          articleLimit,
          aggregator: this.id,
          step: "apply_limit",
        },
        `Limited to first ${articleLimit} item(s)`,
      );
    }

    logger.info(
      {
        itemCount: itemsToProcess.length,
        aggregator: this.id,
        step: "process_items_start",
      },
      `Processing ${itemsToProcess.length} feed items`,
    );

    for (let i = 0; i < itemsToProcess.length; i++) {
      const item = itemsToProcess[i];
      const itemStart = Date.now();

      try {
        logger.debug(
          {
            index: i + 1,
            total: itemsToProcess.length,
            title: item.title,
            url: item.link,
            aggregator: this.id,
            step: "process_item_start",
          },
          `Processing item ${i + 1}/${itemsToProcess.length}`,
        );

        const article: RawArticle = {
          title: item.title || "",
          url: item.link || "",
          published: item.pubDate ? new Date(item.pubDate) : new Date(),
          summary: item.contentSnippet || item.content || "",
          author: item.creator || item.author || undefined,
        };

        // Skip if should skip
        if (this.shouldSkipArticle(article)) {
          logger.debug(
            {
              index: i + 1,
              title: article.title,
              aggregator: this.id,
              step: "item_skipped",
            },
            "Item skipped by shouldSkipArticle",
          );
          continue;
        }

        // Check if article already exists - skip fetching content if it does (unless force refresh)
        if (this.isExistingUrl(article.url)) {
          logger.debug(
            {
              index: i + 1,
              url: article.url,
              title: article.title,
              aggregator: this.id,
              step: "skip_existing",
            },
            "Skipping existing article (will not fetch content)",
          );
          continue;
        }

        // Fetch full content with age confirmation handling
        try {
          logger.debug(
            {
              index: i + 1,
              url: article.url,
              aggregator: this.id,
              step: "fetch_content_start",
            },
            "Fetching article content",
          );

          const contentFetchStart = Date.now();
          const html = await fetchOglafContent(article.url, this.fetchTimeout);
          const contentFetchElapsed = Date.now() - contentFetchStart;

          logger.debug(
            {
              index: i + 1,
              url: article.url,
              elapsed: contentFetchElapsed,
              aggregator: this.id,
              step: "fetch_content_complete",
            },
            "Article content fetched",
          );

          // Extract comic image
          const extractStart = Date.now();
          const comicImage = extractComicImage(html, article.url);
          const extractElapsed = Date.now() - extractStart;

          logger.debug(
            {
              index: i + 1,
              url: article.url,
              elapsed: extractElapsed,
              aggregator: this.id,
              step: "extract_complete",
            },
            "Comic image extracted",
          );

          article.content = comicImage;
        } catch (error) {
          logger.warn(
            {
              error: error instanceof Error ? error : new Error(String(error)),
              url: article.url,
              index: i + 1,
              aggregator: this.id,
              step: "fetch_content_failed",
            },
            "Failed to fetch article content, using summary",
          );
          // Continue with summary if available
          article.content = article.summary || "";
        }

        const itemElapsed = Date.now() - itemStart;
        logger.debug(
          {
            index: i + 1,
            title: article.title,
            elapsed: itemElapsed,
            aggregator: this.id,
            step: "item_complete",
          },
          `Item ${i + 1} processed`,
        );

        articles.push(article);
      } catch (error) {
        logger.error(
          {
            error,
            item,
            index: i + 1,
            aggregator: this.id,
            step: "item_error",
          },
          "Error processing feed item",
        );
        continue;
      }
    }

    const totalElapsed = Date.now() - aggregateStart;
    logger.info(
      {
        aggregator: this.id,
        articleCount: articles.length,
        totalElapsed,
        step: "aggregate_complete",
      },
      `Aggregation complete: ${articles.length} articles`,
    );

    return articles;
  }
}
