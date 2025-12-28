/**
 * RSS-Only aggregator.
 *
 * Lightweight aggregator that uses content directly from the RSS feed
 * without fetching full articles from the web.
 */

import Parser from "rss-parser";

import { BaseAggregator } from "./base/aggregator";
import { fetchFeed } from "./base/fetch";
import type { RawArticle } from "./base/types";

export class FeedContentAggregator extends BaseAggregator {
  override readonly id: string = "feed_content";
  override readonly type: "managed" | "custom" | "social" = "custom";
  override readonly name: string = "RSS-Only";
  override readonly url: string = "";
  override readonly description: string =
    "RSS feeds with full content already included in the feed.";
  override readonly identifierEditable: boolean = true;
  override readonly prefillName: boolean = false;

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
      content: item.content || item.contentSnippet || "",
      summary: item.contentSnippet || item.content || "",
      author: item.creator || (item as Parser.Item & { author?: string }).author || undefined,
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
   * Check if content should be fetched - RSS-only aggregator never fetches.
   */
  protected override shouldFetchContent(_article: RawArticle): boolean {
    // RSS-only aggregator uses content from feed, never fetches from web
    return false;
  }

  /**
   * Process content from RSS feed (sanitize and standardize).
   */
  protected override async processContent(
    html: string,
    article: RawArticle,
  ): Promise<string> {
    // Use base processContent which handles sanitization and standardization
    return await super.processContent(html, article);
  }
}
