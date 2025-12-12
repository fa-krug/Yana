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

import { BaseAggregator } from "./base/aggregator";
import type { RawArticle } from "./base/types";
import { fetchFeed } from "./base/fetch";
import { logger } from "../utils/logger";
import * as cheerio from "cheerio";

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
 * Extract audio enclosure from RSS entry.
 */
function extractEnclosure(item: Record<string, unknown>): {
  url: string;
  type: string;
} {
  // Try enclosures array
  if (
    item["enclosures"] &&
    Array.isArray(item["enclosures"]) &&
    (item["enclosures"] as unknown[]).length > 0
  ) {
    for (const enclosure of item["enclosures"] as unknown[]) {
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
  if (item["links"] && Array.isArray(item["links"])) {
    for (const link of item["links"] as unknown[]) {
      const linkObj = link as { rel?: string; href?: string; type?: string };
      if (linkObj.rel === "enclosure") {
        const url = linkObj.href || "";
        const type = linkObj.type || "";
        if (url) {
          return { url, type: type || "audio/mpeg" };
        }
      }
    }
  }

  return { url: "", type: "" };
}

/**
 * Extract duration from RSS entry.
 *
 * RSS parsers may convert namespaces differently:
 * - rss-parser typically converts itunes:duration to itunes_duration
 * - Some parsers keep the colon format
 */
function extractDuration(item: Record<string, unknown>): number | null {
  // Try itunes_duration (rss-parser format)
  if (item["itunes_duration"]) {
    const durationValue = item["itunes_duration"];
    if (typeof durationValue === "string") {
      const duration = parseDurationToSeconds(durationValue);
      if (duration !== null) return duration;
    }
  }

  // Try itunes:duration (colon format)
  if (item["itunes:duration"]) {
    const durationValue = item["itunes:duration"];
    if (typeof durationValue === "string") {
      const duration = parseDurationToSeconds(durationValue);
      if (duration !== null) return duration;
    }
  }

  // Try duration (generic)
  if (item["duration"]) {
    const durationValue = item["duration"];
    if (typeof durationValue === "string") {
      const duration = parseDurationToSeconds(durationValue);
      if (duration !== null) return duration;
    }
  }

  return null;
}

/**
 * Extract episode or show artwork URL.
 *
 * RSS parsers may convert namespaces differently:
 * - rss-parser typically converts itunes:image to itunes_image
 * - Some parsers keep the colon format
 */
function extractImage(item: Record<string, unknown>): string {
  // Try itunes_image (rss-parser format)
  if (item["itunes_image"]) {
    const itunesImage = item["itunes_image"];
    if (
      typeof itunesImage === "object" &&
      itunesImage !== null &&
      "href" in itunesImage
    ) {
      return (itunesImage as { href: string }).href;
    }
    if (typeof itunesImage === "string") {
      return itunesImage;
    }
  }

  // Try itunes:image (colon format)
  if (item["itunes:image"]) {
    const itunesImage = item["itunes:image"];
    if (
      typeof itunesImage === "object" &&
      itunesImage !== null &&
      "href" in itunesImage
    ) {
      return (itunesImage as { href: string }).href;
    }
    if (typeof itunesImage === "string") {
      return itunesImage;
    }
  }

  // Try image (RSS standard)
  if (item["image"]) {
    const image = item["image"];
    if (typeof image === "object" && image !== null) {
      const imgObj = image as { href?: string; url?: string };
      return imgObj.href || imgObj.url || "";
    }
    if (typeof image === "string") {
      return image;
    }
  }

  // Try media_thumbnail (rss-parser format)
  if (
    item["media_thumbnail"] &&
    Array.isArray(item["media_thumbnail"]) &&
    (item["media_thumbnail"] as unknown[]).length > 0
  ) {
    const thumb = (item["media_thumbnail"] as unknown[])[0] as { url?: string };
    return thumb.url || "";
  }

  // Try media:thumbnail (colon format)
  if (
    item["media:thumbnail"] &&
    Array.isArray(item["media:thumbnail"]) &&
    item["media:thumbnail"].length > 0
  ) {
    return item["media:thumbnail"][0].url || "";
  }

  return "";
}

/**
 * Extract episode description/show notes.
 *
 * RSS parsers may convert namespaces differently:
 * - rss-parser typically converts itunes:summary to itunes_summary
 * - Some parsers keep the colon format
 */
function extractDescription(item: Record<string, unknown>): string {
  // Try content:encoded (full HTML)
  if (item["content"] && Array.isArray(item["content"])) {
    for (const content of item["content"] as unknown[]) {
      const contentObj = content as { type?: string; value?: string };
      if (contentObj.type === "text/html") {
        return contentObj.value || "";
      }
    }
  }

  // Try content_encoded (rss-parser format)
  if (item["content_encoded"]) {
    const contentEncoded = item["content_encoded"];
    if (typeof contentEncoded === "string") {
      return contentEncoded;
    }
  }

  // Try itunes_summary (rss-parser format)
  if (item["itunes_summary"]) {
    const itunesSummary = item["itunes_summary"];
    if (typeof itunesSummary === "string") {
      return itunesSummary;
    }
  }

  // Try itunes:summary (colon format)
  if (item["itunes:summary"]) {
    const itunesSummary = item["itunes:summary"];
    if (typeof itunesSummary === "string") {
      return itunesSummary;
    }
  }

  // Try description
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
  ): Promise<import("rss-parser").Output<any>> {
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

    const feed = sourceData as import("rss-parser").Output<any>;
    const items = feed.items || [];

    const articles: RawArticle[] = [];

    for (const item of items) {
      try {
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
              title: item.title,
            },
            "Podcast episode has no audio enclosure, skipping",
          );
          continue;
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
          // Parse HTML or convert plain text
          if (description.includes("<") && description.includes(">")) {
            // Already HTML - sanitize it
            const $ = cheerio.load(description);
            $("script, iframe, embed, object").remove();
            htmlParts.push($.html());
          } else {
            // Plain text - convert to paragraphs
            const paragraphs = description.split("\n\n");
            for (const para of paragraphs) {
              const trimmed = para.trim();
              if (trimmed) {
                const withBreaks = trimmed.replace(/\n/g, "<br>");
                htmlParts.push(`<p>${withBreaks}</p>`);
              }
            }
          }
          htmlParts.push("</div>");
        }

        const content = htmlParts.join("\n");

        articles.push({
          title: item.title || "Untitled",
          url: item.link || "",
          published: item.pubDate ? new Date(item.pubDate) : new Date(),
          content,
          summary: description,
          thumbnailUrl: imageUrl || undefined,
          mediaUrl: audioUrl,
          duration: duration || undefined,
          mediaType: audioType || "audio/mpeg",
        });
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
        continue;
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
   * Check if content should be fetched - podcast aggregator never fetches.
   */
  protected override shouldFetchContent(article: RawArticle): boolean {
    // Podcast aggregator uses content from feed, never fetches from web
    return false;
  }
}
