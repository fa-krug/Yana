/**
 * MacTechNews aggregator.
 *
 * Specialized aggregator for MacTechNews.de (German Apple news).
 * Extracts article content from .MtnArticle elements, removes mobile headers and sidebars.
 */

import { BaseAggregator } from "./base/aggregator";
import type { RawArticle } from "./base/types";
import { fetchFeed } from "./base/fetch";
import Parser from "rss-parser";

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

  /**
   * Fetch RSS feed data.
   */
  protected override async fetchSourceData(
    limit?: number,
  ): Promise<Parser.Output<any>> {
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

    const feed = sourceData as Parser.Output<any>;
    const items = feed.items || [];

    const articles: RawArticle[] = items.map((item) => ({
      title: item.title || "",
      url: item.link || "",
      published: item.pubDate ? new Date(item.pubDate) : new Date(),
      summary: item.contentSnippet || item.content || "",
      author: item.creator || item.author || undefined,
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
}
