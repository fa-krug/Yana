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
 * Returns both the HTML content and the page object for image fetching.
 */
async function fetchOglafContent(
  url: string,
  timeout: number = 30000,
): Promise<{ html: string; page: Page }> {
  logger.info({ url }, "Fetching Oglaf content");

  const browserInstance = await getBrowser();
  const page: Page = await browserInstance.newPage();

  try {
    await page.setDefaultTimeout(timeout);

    // Navigate to URL and wait for it to be fully loaded
    await page.goto(url, { waitUntil: "networkidle", timeout });

    // Check if we're on a confirmation page and handle it
    const confirmButton = await page
      .waitForSelector("#confirm", { timeout: 5000 })
      .catch(() => null);

    if (confirmButton) {
      logger.debug("Found confirmation page, clicking confirm button");
      // Wait for navigation to complete after clicking
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle", timeout }),
        confirmButton.click(),
      ]).catch(() => {
        // If navigation doesn't happen (SPA), that's fine - page is already loaded
      });
    }

    // Wait for the comic image to be present - this is the definitive indicator
    // that the page is fully loaded and ready
    await page.waitForSelector(
      "#strip, .content img, #content img, .comic img",
      {
        timeout,
        state: "attached",
      },
    );

    // Wait for network to be completely idle (no requests for 500ms)
    await page.waitForLoadState("networkidle");

    // Wait for document to be in complete state
    await page.waitForFunction(() => document.readyState === "complete", {
      timeout,
    });

    // Use evaluate() to get HTML directly from DOM
    // This bypasses Playwright's navigation check in page.content()
    const content = await page.evaluate(() => {
      return document.documentElement.outerHTML;
    });

    if (!content || content.length === 0) {
      throw new Error("Received empty content from page");
    }

    return { html: content, page };
  } catch (error) {
    await page.close();
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
  }
}

/**
 * Fetch an image from a URL using Playwright page context and convert to base64.
 * This ensures cookies/authentication from the page are used.
 */
async function fetchImageAsBase64(
  imageUrl: string,
  page: Page,
): Promise<string | null> {
  try {
    // Ensure URL is absolute
    let absoluteUrl = imageUrl;
    if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://")) {
      // Resolve relative URL using page URL
      const pageUrl = page.url();
      try {
        absoluteUrl = new URL(imageUrl, pageUrl).toString();
      } catch (urlError) {
        logger.warn(
          { error: urlError, imageUrl, pageUrl },
          "Failed to resolve relative image URL",
        );
        return null;
      }
    }

    logger.debug({ imageUrl: absoluteUrl }, "Fetching image as base64");

    // Use Playwright's request context to fetch the image with cookies
    const response = await page.request.get(absoluteUrl);
    if (!response.ok()) {
      logger.warn(
        { url: absoluteUrl, status: response.status() },
        "Failed to fetch image",
      );
      return null;
    }

    const buffer = await response.body();
    const contentType = response.headers()["content-type"] || "image/jpeg";

    // Convert to base64
    const base64 = buffer.toString("base64");
    const dataUri = `data:${contentType};base64,${base64}`;

    logger.info(
      {
        url: absoluteUrl,
        contentType,
        size: buffer.length,
        dataUriLength: dataUri.length,
      },
      "Converted image to base64",
    );

    return dataUri;
  } catch (error) {
    logger.error({ error, url: imageUrl }, "Failed to fetch image as base64");
    return null;
  }
}

/**
 * Extract the comic image URL from Oglaf page HTML.
 */
function extractComicImageUrl(html: string, articleUrl: string): string | null {
  try {
    const $ = cheerio.load(html);
    let comicImg = $("#strip");

    if (comicImg.length === 0) {
      comicImg = $(".content img, #content img, .comic img").first();
    }

    if (comicImg.length > 0) {
      const imgSrc = comicImg.attr("src") || "";
      // Make sure it's a valid absolute URL
      if (
        imgSrc &&
        (imgSrc.startsWith("http://") || imgSrc.startsWith("https://"))
      ) {
        return imgSrc;
      }
      // If relative URL, make it absolute
      if (imgSrc && imgSrc.startsWith("/")) {
        try {
          const baseUrl = new URL(articleUrl);
          return new URL(imgSrc, baseUrl.origin).toString();
        } catch {
          return null;
        }
      }
    }

    return null;
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error : new Error(String(error)),
        url: articleUrl,
      },
      "Failed to extract comic image URL",
    );
    return null;
  }
}

/**
 * Extract the alt text from the comic image.
 */
function extractComicImageAlt(html: string, articleUrl: string): string {
  try {
    const $ = cheerio.load(html);
    let comicImg = $("#strip");

    if (comicImg.length === 0) {
      comicImg = $(".content img, #content img, .comic img").first();
    }

    if (comicImg.length > 0) {
      return comicImg.attr("alt") || comicImg.attr("title") || "Oglaf comic";
    }

    return "Oglaf comic";
  } catch (error) {
    logger.debug(
      {
        error: error instanceof Error ? error : new Error(String(error)),
        url: articleUrl,
      },
      "Failed to extract alt text",
    );
    return "Oglaf comic";
  }
}

export class OglafAggregator extends BaseAggregator {
  override readonly id: string = "oglaf";
  override readonly type: "managed" | "custom" | "social" = "managed";
  override readonly name: string = "Oglaf";
  override readonly url: string = "https://www.oglaf.com/feeds/rss/";
  override readonly description: string =
    "Oglaf - Adult webcomic featuring fantasy, humor, and occasional NSFW content.";

  /**
   * Override fetchArticleContent to handle age confirmation page.
   */
  override async fetchArticleContent(
    url: string,
    options: {
      timeout?: number;
      waitForSelector?: string;
      maxRetries?: number;
    } = {},
  ): Promise<string> {
    const timeout = options.timeout ?? this.fetchTimeout;
    const browserInstance = await getBrowser();
    const page = await browserInstance.newPage();

    try {
      await page.setDefaultTimeout(timeout);

      // Navigate to URL and wait for it to be fully loaded
      await page.goto(url, { waitUntil: "networkidle", timeout });

      // Check if we're on a confirmation page and handle it
      const confirmButton = await page
        .waitForSelector("#confirm", { timeout: 5000 })
        .catch(() => null);

      if (confirmButton) {
        logger.debug("Found confirmation page, clicking confirm button");
        // Wait for navigation to complete after clicking
        await Promise.all([
          page.waitForNavigation({ waitUntil: "networkidle", timeout }),
          confirmButton.click(),
        ]).catch(() => {
          // If navigation doesn't happen (SPA), that's fine - page is already loaded
        });
      }

      // Wait for the comic image to be present - this is the definitive indicator
      // that the page is fully loaded and ready
      await page.waitForSelector(
        "#strip, .content img, #content img, .comic img",
        {
          timeout,
          state: "attached",
        },
      );

      // Wait for network to be completely idle (no requests for 500ms)
      await page.waitForLoadState("networkidle");

      // Wait for document to be in complete state
      await page.waitForFunction(() => document.readyState === "complete", {
        timeout,
      });

      // Use evaluate() to get HTML directly from DOM
      // This bypasses Playwright's navigation check in page.content()
      const content = await page.evaluate(() => {
        return document.documentElement.outerHTML;
      });

      if (!content || content.length === 0) {
        throw new Error("Received empty content from page");
      }

      return content;
    } finally {
      await page.close();
    }
  }

  /**
   * Override processArticleContent to extract only the comic image as base64.
   * This ensures we don't include navigation and other page elements.
   */
  override async processArticleContent(
    article: RawArticle,
    html: string,
    selectorsToRemove?: string[],
  ): Promise<string> {
    // Extract the comic image URL
    const comicImageUrl = extractComicImageUrl(html, article.url);

    if (!comicImageUrl) {
      logger.warn({ url: article.url }, "Could not extract comic image URL");
      return `<p>Could not extract comic. <a href="${article.url}">View on Oglaf</a></p>`;
    }

    // Fetch the image as base64 using Playwright
    const browserInstance = await getBrowser();
    const page = await browserInstance.newPage();

    try {
      // Navigate to the article URL to get cookies/context
      await page.goto(article.url, {
        waitUntil: "networkidle",
        timeout: this.fetchTimeout,
      });

      // Handle age confirmation if needed
      const confirmButton = await page
        .waitForSelector("#confirm", { timeout: 5000 })
        .catch(() => null);

      if (confirmButton) {
        await Promise.all([
          page.waitForNavigation({
            waitUntil: "networkidle",
            timeout: this.fetchTimeout,
          }),
          confirmButton.click(),
        ]).catch(() => {});
      }

      // Fetch image as base64
      const comicImageBase64 = await fetchImageAsBase64(comicImageUrl, page);

      if (comicImageBase64) {
        const altText = extractComicImageAlt(html, article.url);
        return `<img src="${comicImageBase64}" alt="${altText}">`;
      } else {
        // Fallback to URL if base64 conversion fails
        const altText = extractComicImageAlt(html, article.url);
        return `<img src="${comicImageUrl}" alt="${altText}">`;
      }
    } finally {
      await page.close();
    }
  }

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
        let page: Page | null = null;
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
          const { html, page: fetchedPage } = await fetchOglafContent(
            article.url,
            this.fetchTimeout,
          );
          page = fetchedPage;
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

          // Extract comic image URL and convert to base64 for both thumbnail and content
          const extractStart = Date.now();
          const comicImageUrl = extractComicImageUrl(html, article.url);
          let comicImageBase64: string | null = null;

          if (comicImageUrl && page) {
            logger.debug(
              {
                index: i + 1,
                url: article.url,
                imageUrl: comicImageUrl,
                aggregator: this.id,
                step: "extract_image_url",
              },
              "Extracted comic image URL, converting to base64",
            );

            // Fetch image as base64 using the page context (with cookies)
            comicImageBase64 = await fetchImageAsBase64(comicImageUrl, page);
            if (comicImageBase64) {
              // Use the same base64 for both thumbnail and content
              article.thumbnailUrl = comicImageBase64;
              logger.info(
                {
                  index: i + 1,
                  url: article.url,
                  imageUrl: comicImageUrl,
                  base64Length: comicImageBase64.length,
                  aggregator: this.id,
                  step: "extract_thumbnail",
                },
                "Comic image converted to base64",
              );
            } else {
              // Fallback to URL if base64 conversion fails
              article.thumbnailUrl = comicImageUrl;
              logger.warn(
                {
                  index: i + 1,
                  url: article.url,
                  imageUrl: comicImageUrl,
                  aggregator: this.id,
                  step: "extract_thumbnail_fallback",
                },
                "Failed to convert image to base64, using URL",
              );
            }
          } else {
            logger.warn(
              {
                index: i + 1,
                url: article.url,
                hasImageUrl: !!comicImageUrl,
                hasPage: !!page,
                aggregator: this.id,
                step: "extract_thumbnail_missing",
              },
              "Could not extract image URL or page not available",
            );
          }

          // Create content with base64 image if available, otherwise use URL
          let comicImage: string;
          if (comicImageBase64) {
            // Use base64 image in content
            const altText = extractComicImageAlt(html, article.url);
            comicImage = `<img src="${comicImageBase64}" alt="${altText}">`;
          } else if (comicImageUrl) {
            // Fallback to URL if base64 conversion failed
            const altText = extractComicImageAlt(html, article.url);
            comicImage = `<img src="${comicImageUrl}" alt="${altText}">`;
          } else {
            // No image found
            comicImage = `<p>Could not extract comic. <a href="${article.url}">View on Oglaf</a></p>`;
          }

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
        } finally {
          // Close the page if it was opened
          if (page) {
            try {
              await page.close();
            } catch (closeError) {
              logger.debug({ error: closeError }, "Error closing page");
            }
          }
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
