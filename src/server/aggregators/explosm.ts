/**
 * Explosm aggregator.
 *
 * Aggregator for Explosm (Cyanide & Happiness) RSS feed.
 * Extracts only the main comic image from the #comic element.
 */

import * as cheerio from "cheerio";
import Parser from "rss-parser";

import { BaseAggregator } from "./base/aggregator";
import { fetchFeed } from "./base/fetch";
import type { RawArticle } from "./base/types";

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
   * Extract only the main comic image from #comic element.
   * This is the custom extraction logic for Explosm.
   */
  protected override async extractContent(
    html: string,
    article: RawArticle,
  ): Promise<string> {
    const startTime = Date.now();
    this.logger.debug(
      {
        step: "extractContent",
        subStep: "extractComic",
        aggregator: this.id,
        feedId: this.feed?.id,
        url: article.url,
      },
      "Extracting comic image from #comic element",
    );

    try {
      const $ = cheerio.load(html);
      const comic = $("#comic");

      if (comic.length === 0) {
        this.logger.warn(
          {
            step: "extractContent",
            subStep: "extractComic",
            aggregator: this.id,
            feedId: this.feed?.id,
            url: article.url,
          },
          "Could not find #comic element",
        );
        // Fallback to base extraction
        return await super.extractContent(html, article);
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
        this.logger.warn(
          {
            step: "extractContent",
            subStep: "extractComic",
            aggregator: this.id,
            feedId: this.feed?.id,
            url: article.url,
          },
          "No valid comic image found, using entire comic element",
        );
        return comic.html() || "";
      }

      const result = content.html() || "";
      const elapsed = Date.now() - startTime;
      this.logger.debug(
        {
          step: "extractContent",
          subStep: "extractComic",
          aggregator: this.id,
          feedId: this.feed?.id,
          url: article.url,
          elapsed,
        },
        "Comic image extracted",
      );

      return result;
    } catch (error) {
      this.logger.error(
        {
          step: "extractContent",
          subStep: "extractComic",
          aggregator: this.id,
          feedId: this.feed?.id,
          url: article.url,
          error: error instanceof Error ? error : new Error(String(error)),
        },
        "Extraction failed, using base extraction",
      );
      // Fallback to base extraction
      return await super.extractContent(html, article);
    }
  }
}
