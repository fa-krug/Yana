/**
 * Oglaf aggregator.
 *
 * Adult webcomic featuring fantasy, humor, and occasional NSFW content.
 * Handles the age confirmation page automatically.
 */

import * as cheerio from "cheerio";
import { chromium, type Browser, type Page } from "playwright";
import Parser from "rss-parser";

import { logger } from "../utils/logger";

import { BaseAggregator } from "./base/aggregator";
import { ContentFetchError } from "./base/exceptions";
import { fetchFeed } from "./base/fetch";
import type { RawArticle } from "./base/types";

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
 * Close browser instance.
 */
async function closeBrowser(): Promise<void> {
  if (browser) {
    try {
      await browser.close();
      logger.info("Oglaf Playwright browser closed");
    } catch (error) {
      logger.warn({ error }, "Error closing Oglaf Playwright browser");
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
    logger.error({ error }, "Uncaught exception, closing Oglaf browser");
    await cleanup();
  });

  process.on("unhandledRejection", async (reason) => {
    logger.error({ reason }, "Unhandled rejection, closing Oglaf browser");
    await cleanup();
  });
}

// Register handlers when module is loaded
registerShutdownHandlers();

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

  // Store page during enrichment for image fetching
  private currentPage: Page | null = null;

  /**
   * Fetch RSS feed data.
   */
  protected override async fetchSourceData(
    limit?: number,
  ): Promise<Parser.Output<unknown>> {
    const startTime = Date.now();
    this.logger.info(
      {
        step: "fetchSourceData",
        subStep: "start",
        aggregator: this.id,
        feedId: this.feed?.id,
        limit,
      },
      "Fetching RSS feed",
    );

    if (!this.feed) {
      throw new Error("Feed not initialized");
    }

    const feedUrl = this.feed.identifier;
    const feed = await fetchFeed(feedUrl);

    const elapsed = Date.now() - startTime;
    this.logger.info(
      {
        step: "fetchSourceData",
        subStep: "complete",
        aggregator: this.id,
        feedId: this.feed?.id,
        itemCount: feed.items?.length || 0,
        elapsed,
      },
      "RSS feed fetched",
    );

    return feed;
  }

  /**
   * Parse RSS feed items to RawArticle[].
   */
  protected override async parseToRawArticles(
    sourceData: unknown,
  ): Promise<RawArticle[]> {
    const startTime = Date.now();
    this.logger.info(
      {
        step: "parseToRawArticles",
        subStep: "start",
        aggregator: this.id,
        feedId: this.feed?.id,
      },
      "Parsing RSS feed items",
    );

    const feed = sourceData as Parser.Output<unknown>;
    const items = feed.items || [];

    const articles: RawArticle[] = items.map((item) => ({
      title: item.title || "",
      url: item.link || "",
      published: item.pubDate ? new Date(item.pubDate) : new Date(),
      summary: item.contentSnippet || item.content || "",
      author: item.creator || (item as any).author || undefined,
    }));

    const elapsed = Date.now() - startTime;
    this.logger.info(
      {
        step: "parseToRawArticles",
        subStep: "complete",
        aggregator: this.id,
        feedId: this.feed?.id,
        articleCount: articles.length,
        elapsed,
      },
      "Parsed RSS feed items",
    );

    return articles;
  }

  /**
   * Override fetchArticleContentInternal to handle age confirmation page.
   */
  protected override async fetchArticleContentInternal(
    url: string,
    _article: RawArticle,
  ): Promise<string> {
    const startTime = Date.now();
    this.logger.debug(
      {
        step: "enrichArticles",
        subStep: "fetchArticleContent",
        aggregator: this.id,
        feedId: this.feed?.id,
        url,
      },
      "Fetching Oglaf content with age confirmation handling",
    );

    try {
      const { html, page } = await fetchOglafContent(url, this.fetchTimeout);
      // Store page for use in processContent
      this.currentPage = page;
      const elapsed = Date.now() - startTime;
      this.logger.debug(
        {
          step: "enrichArticles",
          subStep: "fetchArticleContent",
          aggregator: this.id,
          feedId: this.feed?.id,
          url,
          elapsed,
        },
        "Oglaf content fetched",
      );
      return html;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      this.logger.error(
        {
          step: "enrichArticles",
          subStep: "fetchArticleContent",
          aggregator: this.id,
          feedId: this.feed?.id,
          url,
          error: error instanceof Error ? error : new Error(String(error)),
          elapsed,
        },
        "Failed to fetch Oglaf content",
      );
      throw error;
    }
  }

  /**
   * Override processContent to extract only the comic image as base64.
   */
  protected override async processContent(
    html: string,
    article: RawArticle,
  ): Promise<string> {
    const startTime = Date.now();
    this.logger.debug(
      {
        step: "enrichArticles",
        subStep: "processContent",
        aggregator: this.id,
        feedId: this.feed?.id,
        url: article.url,
      },
      "Processing Oglaf content - extracting comic image",
    );

    // Extract the comic image URL
    const comicImageUrl = extractComicImageUrl(html, article.url);

    if (!comicImageUrl) {
      this.logger.warn(
        {
          step: "enrichArticles",
          subStep: "processContent",
          aggregator: this.id,
          feedId: this.feed?.id,
          url: article.url,
        },
        "Could not extract comic image URL",
      );
      return `<p>Could not extract comic. <a href="${article.url}">View on Oglaf</a></p>`;
    }

    // Use stored page if available, otherwise create new one
    let page = this.currentPage;
    let shouldClosePage = false;

    if (!page) {
      // Fallback: create new page
      const browserInstance = await getBrowser();
      page = await browserInstance.newPage();
      shouldClosePage = true;

      try {
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
            // eslint-disable-next-line sonarjs/deprecation
            page.waitForNavigation({
              waitUntil: "networkidle",
              timeout: this.fetchTimeout,
            }),
            confirmButton.click(),
          ]).catch(() => {});
        }
      } catch (error) {
        if (shouldClosePage && page) {
          await page.close();
        }
        throw error;
      }
    }

    try {
      // Fetch image as base64 using page context
      const comicImageBase64 = await fetchImageAsBase64(comicImageUrl, page);

      if (comicImageBase64) {
        // Store as thumbnail URL (will be converted by service)
        article.thumbnailUrl = comicImageBase64;
        const altText = extractComicImageAlt(html, article.url);
        const elapsed = Date.now() - startTime;
        this.logger.debug(
          {
            step: "enrichArticles",
            subStep: "processContent",
            aggregator: this.id,
            feedId: this.feed?.id,
            url: article.url,
            elapsed,
          },
          "Comic image extracted and converted to base64",
        );
        return `<img src="${comicImageBase64}" alt="${altText}">`;
      } else {
        // Fallback to URL if base64 conversion fails
        article.thumbnailUrl = comicImageUrl;
        const altText = extractComicImageAlt(html, article.url);
        const elapsed = Date.now() - startTime;
        this.logger.warn(
          {
            step: "enrichArticles",
            subStep: "processContent",
            aggregator: this.id,
            feedId: this.feed?.id,
            url: article.url,
            elapsed,
          },
          "Failed to convert image to base64, using URL",
        );
        return `<img src="${comicImageUrl}" alt="${altText}">`;
      }
    } finally {
      // Close page if we created it
      if (shouldClosePage && page) {
        try {
          await page.close();
        } catch (error) {
          this.logger.debug(
            {
              step: "enrichArticles",
              subStep: "processContent",
              aggregator: this.id,
              feedId: this.feed?.id,
              error,
            },
            "Error closing page",
          );
        }
      }
      // Clear stored page
      this.currentPage = null;
    }
  }

  /**
   * Override enrichArticles to handle page cleanup after processing.
   */
  protected override async enrichArticles(
    articles: RawArticle[],
  ): Promise<RawArticle[]> {
    try {
      return await super.enrichArticles(articles);
    } finally {
      // Ensure page is closed if still open
      if (this.currentPage) {
        try {
          await this.currentPage.close();
        } catch (error) {
          this.logger.debug(
            {
              step: "enrichArticles",
              subStep: "cleanup",
              aggregator: this.id,
              feedId: this.feed?.id,
              error,
            },
            "Error closing page during cleanup",
          );
        }
        this.currentPage = null;
      }
    }
  }
}
