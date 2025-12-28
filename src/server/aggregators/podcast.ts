/**
 * Podcast aggregator.
 *
 * Aggregator for podcast RSS feeds (iTunes/RSS 2.0).
 *
 * Features:
 * - Detects iTunes podcast namespace
 * - Extracts audio enclosure URL
 * - Parses duration from iTunes tags
 * - Creates embedded audio player content
 */

import * as cheerio from "cheerio";

import { BaseAggregator } from "./base/aggregator";
import { fetchFeed } from "./base/fetch";
import type { RawArticle } from "./base/types";

/**
 * Parse duration string to seconds.
 */
function parseDurationToSeconds(durationStr: string): number | null {
  if (!durationStr) return null;

  durationStr = durationStr.trim();

  // Try seconds only
  if (/^\d+$/.test(durationStr)) {
    return parseInt(durationStr, 10);
  }

  // Try HH:MM:SS or MM:SS format
  const parts = durationStr.split(":");
  try {
    if (parts.length === 3) {
      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      const seconds = parseInt(parts[2], 10);
      return hours * 3600 + minutes * 60 + seconds;
    } else if (parts.length === 2) {
      const minutes = parseInt(parts[0], 10);
      const seconds = parseInt(parts[1], 10);
      return minutes * 60 + seconds;
    }
  } catch {
    // Invalid format
  }

  return null;
}

/**
 * Format duration in seconds to HH:MM:SS or MM:SS.
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const remainder = seconds % 3600;
  const minutes = Math.floor(remainder / 60);
  const secs = remainder % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Get property value from object by trying multiple possible keys.
 */
function getAnyProperty<T>(
  obj: Record<string, unknown>,
  keys: string[],
): T | null {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) {
      return obj[key] as T;
    }
  }
  return null;
}

/**
 * Extract audio enclosure from RSS entry.
 */
function extractEnclosure(item: Record<string, unknown>): {
  url: string;
  type: string;
} {
  // Try enclosures array
  const enclosures = item["enclosures"];
  if (Array.isArray(enclosures) && enclosures.length > 0) {
    for (const enclosure of enclosures as unknown[]) {
      const enclosureObj = enclosure as {
        url?: string;
        href?: string;
        type?: string;
      };
      const url = enclosureObj.url || enclosureObj.href || "";
      const mediaType = enclosureObj.type || "";

      // Look for audio types
      if (
        mediaType.startsWith("audio/") ||
        /\.(mp3|m4a|wav|ogg|opus|aac)$/i.test(url)
      ) {
        return { url, type: mediaType || "audio/mpeg" };
      }
    }
  }

  // Try links with enclosure rel
  const links = item["links"];
  if (Array.isArray(links)) {
    for (const link of links as unknown[]) {
      const linkObj = link as { rel?: string; href?: string; type?: string };
      if (linkObj.rel === "enclosure" && linkObj.href) {
        return { url: linkObj.href, type: linkObj.type || "audio/mpeg" };
      }
    }
  }

  return { url: "", type: "" };
}

/**
 * Extract duration from RSS entry.
 */
function extractDuration(item: Record<string, unknown>): number | null {
  const keys = ["itunes_duration", "itunes:duration", "duration"];
  const durationValue = getAnyProperty<string>(item, keys);

  if (typeof durationValue === "string") {
    return parseDurationToSeconds(durationValue);
  }

  return null;
}

/**
 * Extract episode or show artwork URL.
 */
function extractImage(item: Record<string, unknown>): string {
  const keys = ["itunes_image", "itunes:image", "image"];
  const image = getAnyProperty<string | { href?: string; url?: string }>(
    item,
    keys,
  );

  if (image != null) {
    if (typeof image === "object") {
      return image.href || image.url || "";
    }
    if (typeof image === "string") {
      return image;
    }
  }

  // Try media_thumbnail
  const mediaThumbs =
    item["media_thumbnail"] || item["media:thumbnail"] || null;
  if (Array.isArray(mediaThumbs) && mediaThumbs.length > 0) {
    return (mediaThumbs[0] as { url?: string }).url || "";
  }

  return "";
}

/**
 * Extract episode description/show notes.
 */
function extractDescription(item: Record<string, unknown>): string {
  // Try content:encoded (full HTML)
  const contents = item["content"];
  if (Array.isArray(contents)) {
    for (const content of contents as unknown[]) {
      const contentObj = content as { type?: string; value?: string };
      if (contentObj.type === "text/html" && contentObj.value) {
        return contentObj.value;
      }
    }
  }

  const keys = ["content_encoded", "itunes_summary", "itunes:summary"];
  const summaryValue = getAnyProperty<string>(item, keys);
  if (typeof summaryValue === "string") return summaryValue;

  const summary = item["summary"];
  const description = item["description"];
  if (typeof summary === "string") return summary;
  if (typeof description === "string") return description;

  return "";
}

export class PodcastAggregator extends BaseAggregator {
  override readonly id = "podcast";
  override readonly type: "managed" | "custom" | "social" = "custom";
  override readonly name = "Podcast";
  override readonly url = "";
  override readonly description =
    "Podcast RSS feeds - Audio content distributed via RSS with episodes, show notes, and metadata.";

  override readonly identifierType = "url" as const;
  override readonly identifierLabel = "Podcast Feed URL";
  override readonly identifierDescription = "RSS feed URL for the podcast";
  override readonly prefillName = false;

  /**
   * Fetch RSS feed data.
   */
  protected override async fetchSourceData(
    limit?: number,
  ): Promise<import("rss-parser").Output<unknown>> {
    const startTime = Date.now();
    this.logger.info(
      {
        step: "fetchSourceData",
        subStep: "start",
        aggregator: this.id,
        feedId: this.feed?.id,
        limit,
      },
      "Fetching podcast RSS feed",
    );

    if (!this.feed) {
      throw new Error("Feed not initialized");
    }

    const feedUrl = this.feed.identifier;
    const feed = await fetchFeed(feedUrl);

    if (feed.items?.length === 0) {
      this.logger.warn(
        {
          step: "fetchSourceData",
          subStep: "complete",
          aggregator: this.id,
          feedId: this.feed?.id,
          feedUrl,
        },
        "No entries found in podcast feed",
      );
    }

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
      "Podcast RSS feed fetched",
    );

    return feed;
  }

  /**
   * Parse podcast RSS feed items to RawArticle[].
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
      "Parsing podcast episodes",
    );

    const feed = sourceData as import("rss-parser").Output<unknown>;
    const items = feed.items || [];
    const articles: RawArticle[] = [];

    for (const item of items) {
      try {
        const article = await this.parseEpisode(
          item as Record<string, unknown>,
        );
        if (article) {
          articles.push(article);
        }
      } catch (error) {
        this.logger.error(
          {
            step: "parseToRawArticles",
            subStep: "parseEpisode",
            aggregator: this.id,
            feedId: this.feed?.id,
            error: error instanceof Error ? error : new Error(String(error)),
            item,
          },
          "Error processing podcast episode",
        );
      }
    }

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
      "Podcast episodes parsed",
    );

    return articles;
  }

  /**
   * Parse a single podcast episode.
   */
  private async parseEpisode(
    item: Record<string, unknown>,
  ): Promise<RawArticle | null> {
    // Extract podcast-specific data
    const { url: audioUrl, type: audioType } = extractEnclosure(item);
    const duration = extractDuration(item);
    const imageUrl = extractImage(item);
    const description = extractDescription(item);

    if (!audioUrl) {
      this.logger.warn(
        {
          step: "parseToRawArticles",
          subStep: "parseEpisode",
          aggregator: this.id,
          feedId: this.feed?.id,
          title: String(item.title || "Unknown"),
        },
        "Podcast episode has no audio enclosure, skipping",
      );
      return null;
    }

    // Build HTML content with embedded audio player
    const htmlParts: string[] = [];

    // Episode artwork
    if (imageUrl) {
      htmlParts.push(
        `<div class="podcast-artwork"><img src="${imageUrl}" alt="Episode artwork" loading="lazy"></div>`,
      );
    }

    // Audio player
    htmlParts.push(
      `<div class="podcast-player"><audio controls preload="metadata"><source src="${audioUrl}" type="${audioType || "audio/mpeg"}">Your browser does not support the audio element.</audio>`,
    );

    // Duration badge
    if (duration) {
      const formattedDuration = formatDuration(duration);
      htmlParts.push(
        `<span class="podcast-duration">${formattedDuration}</span>`,
      );
    }

    // Download link
    htmlParts.push(
      `<a href="${audioUrl}" class="podcast-download" download><i class="bi bi-download"></i> Download Episode</a></div>`,
    );

    // Episode description/show notes
    if (description) {
      htmlParts.push('<div class="podcast-description">');
      htmlParts.push("<h4>Show Notes</h4>");
      htmlParts.push(this.formatEpisodeDescription(description));
      htmlParts.push("</div>");
    }

    const content = htmlParts.join("\n");

    return {
      title: String(item.title || "Untitled"),
      url: String(item.link || ""),
      published: item.pubDate ? new Date(String(item.pubDate)) : new Date(),
      content,
      summary: description,
      thumbnailUrl: imageUrl || undefined,
      mediaUrl: audioUrl,
      duration: duration || undefined,
      mediaType: audioType || "audio/mpeg",
    };
  }

  /**
   * Format episode description into HTML.
   */
  private formatEpisodeDescription(description: string): string {
    // Parse HTML or convert plain text
    if (description.includes("<") && description.includes(">")) {
      // Already HTML - sanitize it
      const $ = cheerio.load(description);
      $("script, iframe, embed, object").remove();
      return $.html();
    }

    // Plain text - convert to paragraphs
    const paragraphs = description.split("\n\n");
    const htmlParts: string[] = [];
    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (trimmed) {
        const withBreaks = trimmed.replace(/\n/g, "<br>");
        htmlParts.push(`<p>${withBreaks}</p>`);
      }
    }
    return htmlParts.join("\n");
  }

  /**
   * Check if content should be fetched - podcast aggregator never fetches.
   */
  protected override shouldFetchContent(_article: RawArticle): boolean {
    // Podcast aggregator uses content from feed, never fetches from web
    return false;
  }
}
