/**
 * Dark Legacy Comics aggregator.
 *
 * Webcomic featuring humor about World of Warcraft and gaming culture.
 */

import { BaseAggregator } from "./base/aggregator";
import type { RawArticle } from "./base/types";
import { fetchFeed, fetchArticleContent } from "./base/fetch";
import { standardizeContentFormat } from "./base/process";
import { sanitizeHtml } from "./base/utils";
import { logger } from "../utils/logger";
import * as cheerio from "cheerio";

export class DarkLegacyAggregator extends BaseAggregator {
  override readonly id: string = "dark_legacy";
  override readonly type: "managed" | "custom" | "social" = "managed";
  override readonly name: string = "Dark Legacy Comics";
  override readonly url: string = "https://darklegacycomics.com/feed.xml";
  override readonly description: string =
    "Webcomic featuring humor about World of Warcraft and gaming culture.";

  override readonly waitForSelector: string = "#gallery";
  override readonly selectorsToRemove: string[] = [
    "script",
    "style",
    "iframe",
    "noscript",
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

          const processedContent = await standardizeContentFormat(
            sanitizedContent,
            article,
            article.url,
            generateTitleImage,
            addSourceFooter,
          );

          article.content = processedContent;
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
   * Extract comic images from #gallery element.
   * This matches the Python implementation's extract_content method.
   */
  private extractContent(html: string, url: string): string {
    try {
      const $ = cheerio.load(html);
      const gallery = $("#gallery");

      if (gallery.length === 0) {
        logger.warn(
          {
            url,
            aggregator: this.id,
            step: "gallery_not_found",
          },
          `Could not find #gallery element in ${url}`,
        );
        return html; // Fallback to original HTML
      }

      // Create a new div to hold the extracted images
      const contentDiv = $("<div></div>");

      // Find all img tags in the gallery
      const images = gallery.find("img");

      if (images.length === 0) {
        // If no images found, use the gallery element itself
        logger.debug(
          {
            url,
            aggregator: this.id,
            step: "no_images_found",
          },
          "No images found in gallery, using gallery element",
        );
        return gallery.html() || "";
      }

      // Extract each image
      images.each((_, img) => {
        const $img = $(img);
        const newImg = $("<img>");

        // Get src or data-src
        const imgSrc = $img.attr("src") || $img.attr("data-src");
        if (imgSrc) {
          newImg.attr("src", imgSrc);
        }

        // Copy alt text if present
        const alt = $img.attr("alt");
        if (alt) {
          newImg.attr("alt", alt);
        }

        contentDiv.append(newImg);
      });

      const result = contentDiv.html() || "";
      if (!result) {
        // Fallback to gallery if no images were successfully extracted
        logger.warn(
          {
            url,
            aggregator: this.id,
            step: "extraction_empty",
          },
          "Extraction resulted in empty content, using gallery element",
        );
        return gallery.html() || "";
      }

      return result;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error : new Error(String(error)),
          url,
          aggregator: this.id,
          step: "extraction_failed",
        },
        `Extraction failed for ${url}`,
      );
      return html; // Fallback to original HTML
    }
  }
}
