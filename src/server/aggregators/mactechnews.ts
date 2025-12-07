/**
 * MacTechNews aggregator.
 *
 * Specialized aggregator for MacTechNews.de (German Apple news).
 * Extracts article content from .MtnArticle elements, removes mobile headers and sidebars.
 */

import { BaseAggregator } from "./base/aggregator";
import type { RawArticle } from "./base/types";
import { fetchFeed, fetchArticleContent } from "./base/fetch";
import { extractContent } from "./base/extract";
import { standardizeContentFormat } from "./base/process";
import { sanitizeHtml } from "./base/utils";
import { logger } from "../utils/logger";

export class MacTechNewsAggregator extends BaseAggregator {
  override readonly id: string = "mactechnews";
  override readonly type: "managed" | "custom" | "social" = "managed";
  override readonly name: string = "MacTechNews";
  override readonly url: string = "https://www.mactechnews.de/Rss/News.x";
  override readonly description: string =
    "MacTechNews.de - German technology news website focused on Apple products and ecosystem.";

  override readonly selectorsToRemove: string[] = [
    ".NewsPictureMobile",
    "header",
    "aside",
    "script",
    "style",
    "iframe",
    "noscript",
    "svg",
  ];

  override readonly waitForSelector: string = ".MtnArticle";

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

    const feedUrl = this.feed.identifier || this.url;
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

          // Extract content from .MtnArticle element
          const extractStart = Date.now();
          const content = extractContent(html, {
            contentSelector: ".MtnArticle",
            selectorsToRemove: this.selectorsToRemove,
          });
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
          const sanitizedContent = sanitizeHtml(content);

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
}
