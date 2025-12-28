/**
 * MacTechNews aggregator.
 *
 * Specialized aggregator for MacTechNews.de (German Apple news).
 * Extracts article content from .MtnArticle elements, removes mobile headers and sidebars.
 */

import * as cheerio from "cheerio";
import Parser from "rss-parser";

import { BaseAggregator } from "./base/aggregator";
import { fetchFeed } from "./base/fetch";
import type { RawArticle } from "./base/types";

export class MacTechNewsAggregator extends BaseAggregator {
  override readonly id: string = "mactechnews";
  override readonly type: "managed" | "custom" | "social" = "managed";
  override readonly name: string = "MacTechNews";
  override readonly url: string = "https://www.mactechnews.de/Rss/News.x";
  override readonly description: string =
    "MacTechNews.de - German technology news website focused on Apple products and ecosystem.";

  override readonly options = {
    max_comments: {
      type: "integer" as const,
      label: "Maximum comments to extract",
      helpText:
        "Number of comments to extract and inline at the end of articles (0 to disable)",
      default: 0,
      required: false,
      min: 0,
      max: 100,
    },
  };

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

    const feedUrl = this.feed.identifier || this.url;
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
      author:
        item.creator ||
        (item as Parser.Item & { author?: string }).author ||
        undefined,
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
   * Extract content from .MtnArticle element.
   */
  protected override async extractContent(
    html: string,
    article: RawArticle,
  ): Promise<string> {
    const startTime = Date.now();
    this.logger.debug(
      {
        step: "extractContent",
        subStep: "extractMtnArticle",
        aggregator: this.id,
        feedId: this.feed?.id,
        url: article.url,
      },
      "Extracting content from .MtnArticle element",
    );

    const { extractContent } = await import("./base/extract");
    const extracted = extractContent(html, {
      contentSelector: ".MtnArticle",
      selectorsToRemove: this.selectorsToRemove,
    });

    // Use base removeElementsBySelectors for additional cleanup
    const result = await super.removeElementsBySelectors(extracted, article);

    const elapsed = Date.now() - startTime;
    this.logger.debug(
      {
        step: "extractContent",
        subStep: "extractMtnArticle",
        aggregator: this.id,
        feedId: this.feed?.id,
        url: article.url,
        elapsed,
      },
      "Content extracted from .MtnArticle",
    );

    return result;
  }

  /**
   * Override processContent to add comments if enabled.
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
      "Processing MacTechNews content",
    );

    // Add comments if enabled
    const maxComments = this.getOption("max_comments", 0) as number;
    let content = html;
    if (maxComments > 0) {
      try {
        this.logger.info(
          {
            step: "enrichArticles",
            subStep: "processContent",
            aggregator: this.id,
            feedId: this.feed?.id,
            url: article.url,
            maxComments,
          },
          "Extracting comments",
        );
        // Extract comments (need original HTML to extract comments)
        // Fetch original HTML again since processContent receives extracted content
        const originalHtml = await this.fetchArticleContentInternal(
          article.url,
          article,
        );
        const commentsHtml = await this.extractComments(
          article.url,
          originalHtml,
          maxComments,
        );
        if (commentsHtml) {
          content = `${content}\n\n${commentsHtml}`;
        }
      } catch (error) {
        this.logger.warn(
          {
            step: "enrichArticles",
            subStep: "processContent",
            aggregator: this.id,
            feedId: this.feed?.id,
            url: article.url,
            error: error instanceof Error ? error : new Error(String(error)),
          },
          "Failed to extract comments",
        );
        // Comments are optional, continue without them
      }
    }

    // Use base processContent for standardization
    const result = await super.processContent(content, article);

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
      "MacTechNews content processed",
    );

    return result;
  }

  /**
   * Extract comments from a MacTechNews article.
   */
  private async extractComments(
    articleUrl: string,
    articleHtml: string,
    maxComments: number,
  ): Promise<string | null> {
    const startTime = Date.now();
    this.logger.info(
      {
        step: "enrichArticles",
        subStep: "extractComments",
        aggregator: this.id,
        feedId: this.feed?.id,
        url: articleUrl,
      },
      "Extracting comments from article HTML",
    );

    try {
      const $ = cheerio.load(articleHtml);

      // Find comments container
      const commentContainer = $(".MtnCommentScroll").first();
      if (commentContainer.length === 0) {
        this.logger.info(
          {
            step: "enrichArticles",
            subStep: "extractComments",
            aggregator: this.id,
            feedId: this.feed?.id,
            url: articleUrl,
          },
          "No comment container found",
        );
        return null;
      }

      // Find all comment elements
      const commentElements = commentContainer.find(".MtnComment");
      if (commentElements.length === 0) {
        this.logger.info(
          {
            step: "enrichArticles",
            subStep: "extractComments",
            aggregator: this.id,
            feedId: this.feed?.id,
            url: articleUrl,
          },
          "No comments found",
        );
        return null;
      }

      // Extract and format comments
      const commentHtmlParts: string[] = [];
      const commentHeader = `<h3><a href="${articleUrl}#comments" target="_blank" rel="noopener">Comments</a></h3>`;
      let extractedCount = 0;

      commentElements.slice(0, maxComments).each((i, element) => {
        try {
          const $el = $(element);

          // Extract author
          const authorElem = $el.find(".MtnCommentAccountName").first();
          if (authorElem.length === 0) {
            return; // Skip if no author found
          }
          const author = authorElem.text().trim() || "Unknown";

          // Extract comment text
          const textElem = $el.find(".MtnCommentText").first();
          if (textElem.length === 0) {
            return; // Skip if no text found
          }
          const commentText = textElem.html() || "";
          if (!commentText.trim()) {
            return; // Skip empty comments
          }

          // Extract comment ID for URL
          const commentId = $el.attr("id") || `comment-${i}`;
          const commentUrl = `${articleUrl}#${commentId}`;

          commentHtmlParts.push(
            `<blockquote><p><strong>${this.escapeHtml(author)}</strong> | <a href="${commentUrl}">source</a></p><div>${commentText}</div></blockquote>`,
          );
          extractedCount++;
        } catch (error) {
          this.logger.warn(
            {
              step: "enrichArticles",
              subStep: "extractComments",
              aggregator: this.id,
              feedId: this.feed?.id,
              error: error instanceof Error ? error : new Error(String(error)),
              index: i,
            },
            "Error extracting comment",
          );
        }
      });

      if (extractedCount === 0) {
        return null;
      }

      const elapsed = Date.now() - startTime;
      this.logger.info(
        {
          step: "enrichArticles",
          subStep: "extractComments",
          aggregator: this.id,
          feedId: this.feed?.id,
          extractedCount,
          elapsed,
        },
        "Successfully extracted comments",
      );

      // Wrap comments in section tag
      return `<section>${commentHeader}${commentHtmlParts.join("\n")}</section>`;
    } catch (error) {
      this.logger.warn(
        {
          step: "enrichArticles",
          subStep: "extractComments",
          aggregator: this.id,
          feedId: this.feed?.id,
          error: error instanceof Error ? error : new Error(String(error)),
          url: articleUrl,
        },
        "Unexpected error extracting comments",
      );
      return null;
    }
  }

  /**
   * Escape HTML special characters.
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}
