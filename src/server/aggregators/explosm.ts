/**
 * Explosm aggregator.
 *
 * Aggregator for Explosm (Cyanide & Happiness) RSS feed.
 * Extracts only the main comic image from the #comic element.
 */

import { BaseAggregator } from "./base/aggregator";
import type { RawArticle } from "./base/types";
import { fetchFeed, fetchArticleContent } from "./base/fetch";
import { standardizeContentFormat } from "./base/process";
import { sanitizeHtml } from "./base/utils";
import { logger } from "../utils/logger";
import * as cheerio from "cheerio";

export class ExplosmAggregator extends BaseAggregator {
  override readonly id = "explosm";
  override readonly type: "managed" | "custom" | "social" = "managed";
  override readonly name = "Cyanide & Happiness";
  override readonly url = "https://explosm.net/rss.xml";
  override readonly description =
    "Daily webcomic featuring dark humor and stick figure comedy from Explosm Entertainment.";

  override readonly waitForSelector = "#comic";
  override readonly selectorsToRemove = [
    'div[class*="MainComic__LinkContainer"]',
    'div[class*="MainComic__MetaContainer"]',
    'img[loading~="lazy"]',
    "aside",
    "script",
    "style",
    "iframe",
  ];

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

        // Fetch full content
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
          const html = await fetchArticleContent(article.url, {
            timeout: this.fetchTimeout,
            waitForSelector: this.waitForSelector,
          });
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

          // Extract content using custom logic
          const extractStart = Date.now();
          const extractedContent = this.extractContent(html, article.url);
          const extractElapsed = Date.now() - extractStart;

          logger.debug(
            {
              index: i + 1,
              url: article.url,
              elapsed: extractElapsed,
              aggregator: this.id,
              step: "extract_complete",
            },
            "Content extracted",
          );

          // Sanitize HTML (remove scripts, rename attributes)
          const sanitizedContent = sanitizeHtml(extractedContent);

          // Process content (standardize format with images and source link)
          const processStart = Date.now();
          const generateTitleImage = this.feed?.generateTitleImage ?? true;
          const addSourceFooter = this.feed?.addSourceFooter ?? true;

          article.content = await standardizeContentFormat(
            sanitizedContent,
            article,
            article.url,
            generateTitleImage,
            addSourceFooter,
          );
          const processElapsed = Date.now() - processStart;

          logger.debug(
            {
              index: i + 1,
              url: article.url,
              elapsed: processElapsed,
              aggregator: this.id,
              step: "process_complete",
            },
            "Article processed",
          );
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

  /**
   * Extract only the main comic image from #comic element.
   * This is the custom extraction logic for Explosm.
   */
  private extractContent(html: string, url: string): string {
    try {
      const $ = cheerio.load(html);
      const comic = $("#comic");

      if (comic.length === 0) {
        logger.warn({ url }, "Could not find #comic element");
        return "";
      }

      // Create a new container for the extracted content
      const content = $("<div></div>");
      let foundImage = false;

      // Find all images in the comic element
      comic.find("img").each((_, img) => {
        // Skip if already found an image
        if (foundImage) {
          return;
        }

        // Skip images inside noscript tags
        const $img = $(img);
        if ($img.closest("noscript").length > 0) {
          return;
        }

        // Get image source (try src first, then data-src)
        const imgSrc = $img.attr("src") || $img.attr("data-src");
        if (!imgSrc || imgSrc.startsWith("data:")) {
          return;
        }

        // Only accept http/https URLs
        if (!imgSrc.startsWith("http://") && !imgSrc.startsWith("https://")) {
          return;
        }

        // Create new image element
        const newImg = $("<img>");
        newImg.attr("src", imgSrc);

        // Copy alt text if available
        const alt = $img.attr("alt");
        if (alt) {
          newImg.attr("alt", alt);
        }

        content.append(newImg);
        foundImage = true;
      });

      // If no valid image was found, use the entire comic element as fallback
      if (!foundImage) {
        logger.warn(
          { url },
          "No valid comic image found, using entire comic element",
        );
        return comic.html() || "";
      }

      return content.html() || "";
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error : new Error(String(error)),
          url,
        },
        "Extraction failed",
      );
      return "";
    }
  }
}
