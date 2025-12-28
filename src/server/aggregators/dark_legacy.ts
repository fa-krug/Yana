/**
 * Dark Legacy Comics aggregator.
 *
 * Webcomic featuring humor about World of Warcraft and gaming culture.
 */

import * as cheerio from "cheerio";
import Parser from "rss-parser";

import { BaseAggregator } from "./base/aggregator";
import { fetchFeed } from "./base/fetch";
import type { RawArticle } from "./base/types";

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
   * Extract comic images from #gallery element.
   */
  protected override async extractContent(
    html: string,
    article: RawArticle,
  ): Promise<string> {
    const startTime = Date.now();
    this.logger.debug(
      {
        step: "extractContent",
        subStep: "extractGallery",
        aggregator: this.id,
        feedId: this.feed?.id,
        url: article.url,
      },
      "Extracting comic images from #gallery element",
    );

    try {
      const $ = cheerio.load(html);
      const gallery = $("#gallery");

      if (gallery.length === 0) {
        this.logger.warn(
          {
            step: "extractContent",
            subStep: "extractGallery",
            aggregator: this.id,
            feedId: this.feed?.id,
            url: article.url,
          },
          `Could not find #gallery element in ${article.url}`,
        );
        // Fallback to base extraction
        return await super.extractContent(html, article);
      }

      // Create a new div to hold the extracted images
      const contentDiv = $("<div></div>");

      // Find all img tags in the gallery
      const images = gallery.find("img");

      if (images.length === 0) {
        // If no images found, use the gallery element itself
        this.logger.debug(
          {
            step: "extractContent",
            subStep: "extractGallery",
            aggregator: this.id,
            feedId: this.feed?.id,
            url: article.url,
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
        this.logger.warn(
          {
            step: "extractContent",
            subStep: "extractGallery",
            aggregator: this.id,
            feedId: this.feed?.id,
            url: article.url,
          },
          "Extraction resulted in empty content, using gallery element",
        );
        return gallery.html() || "";
      }

      const elapsed = Date.now() - startTime;
      this.logger.debug(
        {
          step: "extractContent",
          subStep: "extractGallery",
          aggregator: this.id,
          feedId: this.feed?.id,
          url: article.url,
          elapsed,
        },
        "Comic images extracted from gallery",
      );

      return result;
    } catch (error) {
      this.logger.error(
        {
          step: "extractContent",
          subStep: "extractGallery",
          aggregator: this.id,
          feedId: this.feed?.id,
          url: article.url,
          error: error instanceof Error ? error : new Error(String(error)),
        },
        `Extraction failed for ${article.url}, using base extraction`,
      );
      // Fallback to base extraction
      return await super.extractContent(html, article);
    }
  }
}
