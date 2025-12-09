/**
 * Full website aggregator.
 *
 * Generic aggregator for any RSS feed with full content extraction.
 */

import { BaseAggregator } from "./base/aggregator";
import type { RawArticle } from "./base/types";
import { fetchFeed, fetchArticleContent } from "./base/fetch";
import { logger } from "../utils/logger";
import * as cheerio from "cheerio";

export class FullWebsiteAggregator extends BaseAggregator {
  override readonly id: string = "full_website";
  override readonly type: "managed" | "custom" | "social" = "custom";
  override readonly name: string = "Full Article";
  override readonly url: string = "https://example.com/feed.xml";
  override readonly description: string =
    "Generic aggregator for any RSS feed from news sites and blogs.";
  override readonly identifierEditable: boolean = true;
  override readonly prefillName: boolean = false;

  override readonly options = {
    exclude_selectors: {
      type: "string" as const,
      label: "CSS selectors to exclude (one per line)",
      helpText:
        "Additional CSS selectors for elements to remove from content. Enter one selector per line.\n\nExample:\n.advertisement\n.social-share\nfooter\nscript",
      default: "",
      required: false,
      widget: "textarea" as const,
    },
    ignore_title_contains: {
      type: "string" as const,
      label: "Ignore articles if title contains (one per line)",
      helpText:
        "Skip articles if the title contains any of these strings (case-insensitive). Enter one string per line.\n\nExample:\n[SPONSORED]\nAdvertisement\nPremium",
      default: "",
      required: false,
      widget: "textarea" as const,
    },
    ignore_content_contains: {
      type: "string" as const,
      label: "Ignore articles if content contains (one per line)",
      helpText:
        "Skip articles if the title or content contains any of these strings (case-insensitive). Enter one string per line.\n\nExample:\npaywall\nsubscription required\nmembers only",
      default: "",
      required: false,
      widget: "textarea" as const,
    },
    regex_replacements: {
      type: "string" as const,
      label: "Regex replacements (one per line)",
      helpText:
        "Apply regex replacements to article content. One replacement per line in format: pattern|replacement\n\nApplied sequentially after all other processing.\n\nExample:\nfoo|bar\n\\d{4}|YEAR\n^\\s+|  (remove leading spaces)\n\nNote: Use | to separate pattern from replacement. To include a literal |, escape it as \\|",
      default: "",
      required: false,
      widget: "textarea" as const,
    },
  };

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

        // Check ignore_title_contains
        const ignoreTitle = this.getOption(
          "ignore_title_contains",
          "",
        ) as string;
        if (ignoreTitle) {
          const titleFilters = ignoreTitle
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
          if (
            titleFilters.some((filter) =>
              article.title.toLowerCase().includes(filter.toLowerCase()),
            )
          ) {
            logger.debug(
              {
                index: i + 1,
                title: article.title,
                aggregator: this.id,
                step: "item_skipped",
              },
              "Item skipped by ignore_title_contains filter",
            );
            continue;
          }
        }

        // Check ignore_content_contains
        const ignoreContent = this.getOption(
          "ignore_content_contains",
          "",
        ) as string;
        if (ignoreContent) {
          const contentFilters = ignoreContent
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
          const searchText =
            `${article.title} ${article.summary || ""}`.toLowerCase();
          if (
            contentFilters.some((filter) =>
              searchText.includes(filter.toLowerCase()),
            )
          ) {
            logger.debug(
              {
                index: i + 1,
                title: article.title,
                aggregator: this.id,
                step: "item_skipped",
              },
              "Item skipped by ignore_content_contains filter",
            );
            continue;
          }
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
        if (!this.forceRefresh) {
          // Check cache first
          // TODO: Implement caching
        }

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

          // Process content using processArticleContent (handles extraction, sanitization, and processing)
          const extractStart = Date.now();

          // Combine base selectors with exclude_selectors option
          const excludeSelectors = this.getOption(
            "exclude_selectors",
            "",
          ) as string;
          const additionalSelectors = excludeSelectors
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
          const allSelectorsToRemove = [
            ...this.selectorsToRemove,
            ...additionalSelectors,
          ];

          // Process with custom selectors (including exclude_selectors)
          let processedContent = await this.processArticleContent(
            article,
            html,
            allSelectorsToRemove,
          );

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

          // Apply regex replacements
          const processStart = Date.now();
          const regexReplacements = this.getOption(
            "regex_replacements",
            "",
          ) as string;
          if (regexReplacements) {
            processedContent = this.applyRegexReplacements(
              processedContent,
              regexReplacements,
            );
          }

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
   * Apply regex replacements to content.
   */
  private applyRegexReplacements(
    content: string,
    regexReplacementsText: string,
  ): string {
    if (!regexReplacementsText || !regexReplacementsText.trim()) {
      return content;
    }

    const lines = regexReplacementsText.trim().split("\n");
    let result = content;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum].trim();
      if (!line || line.startsWith("#")) {
        // Skip empty lines and comments
        continue;
      }

      // Split on | (but allow escaped \|)
      const parts: string[] = [];
      let currentPart: string[] = [];
      let i = 0;

      while (i < line.length) {
        if (line[i] === "\\" && i + 1 < line.length) {
          // Escape sequence
          if (line[i + 1] === "|") {
            currentPart.push("|");
            i += 2;
          } else {
            currentPart.push(line[i]);
            currentPart.push(line[i + 1]);
            i += 2;
          }
        } else if (line[i] === "|") {
          // Found delimiter
          parts.push(currentPart.join(""));
          currentPart = [];
          i++;
        } else {
          currentPart.push(line[i]);
          i++;
        }
      }

      parts.push(currentPart.join(""));

      if (parts.length < 2) {
        logger.warn(
          {
            lineNum: lineNum + 1,
            line,
          },
          "Invalid regex replacement format, expected pattern|replacement",
        );
        continue;
      }

      const pattern = parts[0].trim();
      const replacement = parts.slice(1).join("|").trim(); // Join back in case | was in replacement

      if (!pattern) {
        logger.warn({ lineNum: lineNum + 1 }, "Empty pattern, skipping");
        continue;
      }

      try {
        // Apply regex replacement
        result = result.replace(new RegExp(pattern, "g"), replacement);
        logger.debug({ pattern, replacement }, "Applied regex replacement");
      } catch (error) {
        logger.warn(
          {
            error,
            pattern,
            lineNum: lineNum + 1,
          },
          "Invalid regex pattern, skipping",
        );
        continue;
      }
    }

    return result;
  }
}
