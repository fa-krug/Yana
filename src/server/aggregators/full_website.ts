/**
 * Full website aggregator.
 *
 * Generic aggregator for any RSS feed with full content extraction.
 */

import Parser from "rss-parser";

import { BaseAggregator } from "./base/aggregator";
import { fetchFeed } from "./base/fetch";
import type { RawArticle } from "./base/types";

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

  /**
   * Fetch RSS feed data.
   */
  protected async fetchSourceData(
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
  protected async parseToRawArticles(
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

    const articles: RawArticle[] = items.map((item) => {
      const article: RawArticle = {
        title: item.title || "",
        url: item.link || "",
        published: item.pubDate ? new Date(item.pubDate) : new Date(),
        summary: item.contentSnippet || item.content || "",
        author: item.creator || (item as Parser.Item & { author?: string }).author || undefined,
      };

      // Extract metadata
      return article;
    });

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
   * Apply article filters (ignore_title_contains, ignore_content_contains).
   */
  protected override async applyArticleFilters(
    articles: RawArticle[],
  ): Promise<RawArticle[]> {
    const startTime = Date.now();
    this.logger.debug(
      {
        step: "filterArticles",
        subStep: "applyArticleFilters",
        aggregator: this.id,
        feedId: this.feed?.id,
        initialCount: articles.length,
      },
      "Applying article filters",
    );

    let filtered = articles;

    // Check ignore_title_contains
    const ignoreTitle = this.getOption("ignore_title_contains", "") as string;
    if (ignoreTitle) {
      const titleFilters = ignoreTitle
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      filtered = filtered.filter((article) => {
        const shouldSkip = titleFilters.some((filter) =>
          article.title.toLowerCase().includes(filter.toLowerCase()),
        );
        if (shouldSkip) {
          this.logger.debug(
            {
              step: "filterArticles",
              subStep: "applyArticleFilters",
              aggregator: this.id,
              feedId: this.feed?.id,
              url: article.url,
              title: article.title,
              filter: "ignore_title_contains",
            },
            "Article skipped by ignore_title_contains filter",
          );
        }
        return !shouldSkip;
      });
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

      filtered = filtered.filter((article) => {
        const searchText =
          `${article.title} ${article.summary || ""}`.toLowerCase();
        const shouldSkip = contentFilters.some((filter) =>
          searchText.includes(filter.toLowerCase()),
        );
        if (shouldSkip) {
          this.logger.debug(
            {
              step: "filterArticles",
              subStep: "applyArticleFilters",
              aggregator: this.id,
              feedId: this.feed?.id,
              url: article.url,
              title: article.title,
              filter: "ignore_content_contains",
            },
            "Article skipped by ignore_content_contains filter",
          );
        }
        return !shouldSkip;
      });
    }

    const elapsed = Date.now() - startTime;
    this.logger.debug(
      {
        step: "filterArticles",
        subStep: "applyArticleFilters",
        aggregator: this.id,
        feedId: this.feed?.id,
        initialCount: articles.length,
        filteredCount: filtered.length,
        elapsed,
      },
      "Article filters applied",
    );

    return filtered;
  }

  /**
   * Apply article limit.
   */
  protected override async applyArticleLimit(
    articles: RawArticle[],
  ): Promise<RawArticle[]> {
    // Call parent implementation to enforce daily limit
    return super.applyArticleLimit(articles);
  }

  /**
   * Remove elements by selectors (combines base selectors with exclude_selectors option).
   */
  protected override async removeElementsBySelectors(
    html: string,
    article: RawArticle,
  ): Promise<string> {
    const startTime = Date.now();

    // Combine base selectors with exclude_selectors option
    const excludeSelectors = this.getOption("exclude_selectors", "") as string;
    const additionalSelectors = excludeSelectors
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const allSelectorsToRemove = [
      ...this.selectorsToRemove,
      ...additionalSelectors,
    ];

    this.logger.debug(
      {
        step: "extractContent",
        subStep: "removeElementsBySelectors",
        aggregator: this.id,
        feedId: this.feed?.id,
        url: article.url,
        selectorCount: allSelectorsToRemove.length,
      },
      "Removing elements by selectors",
    );

    const { removeElementsBySelectors } = await import("./base/utils");
    const result = removeElementsBySelectors(html, allSelectorsToRemove);

    const elapsed = Date.now() - startTime;
    this.logger.debug(
      {
        step: "extractContent",
        subStep: "removeElementsBySelectors",
        aggregator: this.id,
        feedId: this.feed?.id,
        url: article.url,
        selectorCount: allSelectorsToRemove.length,
        elapsed,
      },
      "Elements removed by selectors",
    );

    return result;
  }

  /**
   * Process content (apply regex replacements after standard processing).
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
      "Processing content",
    );

    // First, use base processContent (standardize format)
    let processed = await super.processContent(html, article);

    // Then apply regex replacements if configured
    const regexReplacements = this.getOption(
      "regex_replacements",
      "",
    ) as string;
    if (regexReplacements) {
      processed = this.applyRegexReplacements(processed, regexReplacements);
      this.logger.debug(
        {
          step: "enrichArticles",
          subStep: "processContent",
          aggregator: this.id,
          feedId: this.feed?.id,
          url: article.url,
          appliedReplacements: true,
        },
        "Applied regex replacements",
      );
    }

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
      "Content processed",
    );

    return processed;
  }

  /**
   * Split a regex replacement line into pattern and replacement.
   */
  private parseRegexLine(line: string): string[] {
    const parts: string[] = [];
    let currentPart: string[] = [];
    let i = 0;

    while (i < line.length) {
      if (line[i] === "\\" && i + 1 < line.length) {
        currentPart.push(line[i + 1] === "|" ? "|" : line[i] + line[i + 1]);
        i += 2;
      } else if (line[i] === "|") {
        parts.push(currentPart.join(""));
        currentPart = [];
        i++;
      } else {
        currentPart.push(line[i]);
        i++;
      }
    }
    parts.push(currentPart.join(""));
    return parts;
  }

  /**
   * Apply regex replacements to content.
   */
  private applyRegexReplacements(
    content: string,
    regexReplacementsText: string,
  ): string {
    if (!regexReplacementsText?.trim()) return content;

    const lines = regexReplacementsText.trim().split("\n");
    let result = content;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith("#")) continue;

      const parts = this.parseRegexLine(line);
      if (parts.length < 2 || !parts[0].trim()) {
        this.logger.warn({ step: "processContent", lineNum: i + 1 }, "Invalid regex format");
        continue;
      }

      try {
        result = result.replace(new RegExp(parts[0].trim(), "g"), parts.slice(1).join("|").trim());
      } catch (error) {
        this.logger.warn({ step: "processContent", error, lineNum: i + 1 }, "Invalid regex pattern");
      }
    }

    return result;
  }
}
