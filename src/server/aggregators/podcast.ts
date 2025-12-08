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
function extractEnclosure(item: any): { url: string; type: string } {
  // Try enclosures array
  if (
    item.enclosures &&
    Array.isArray(item.enclosures) &&
    item.enclosures.length > 0
  ) {
    for (const enclosure of item.enclosures) {
      const url = enclosure.url || enclosure.href || "";
      const mediaType = enclosure.type || "";

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
  if (item.links && Array.isArray(item.links)) {
    for (const link of item.links) {
      if (link.rel === "enclosure") {
        const url = link.href || "";
        const type = link.type || "";
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
function extractDuration(item: any): number | null {
  // Try itunes_duration (rss-parser format)
  if (item.itunes_duration) {
    const duration = parseDurationToSeconds(item.itunes_duration);
    if (duration !== null) return duration;
  }

  // Try itunes:duration (colon format)
  if (item["itunes:duration"]) {
    const duration = parseDurationToSeconds(item["itunes:duration"]);
    if (duration !== null) return duration;
  }

  // Try duration (generic)
  if (item.duration) {
    const duration = parseDurationToSeconds(item.duration);
    if (duration !== null) return duration;
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
function extractImage(item: any): string {
  // Try itunes_image (rss-parser format)
  if (item.itunes_image) {
    const itunesImage = item.itunes_image;
    if (typeof itunesImage === "object" && itunesImage.href) {
      return itunesImage.href;
    }
    if (typeof itunesImage === "string") {
      return itunesImage;
    }
  }

  // Try itunes:image (colon format)
  if (item["itunes:image"]) {
    const itunesImage = item["itunes:image"];
    if (typeof itunesImage === "object" && itunesImage.href) {
      return itunesImage.href;
    }
    if (typeof itunesImage === "string") {
      return itunesImage;
    }
  }

  // Try image (RSS standard)
  if (item.image) {
    if (typeof item.image === "object") {
      return item.image.href || item.image.url || "";
    }
    if (typeof item.image === "string") {
      return item.image;
    }
  }

  // Try media_thumbnail (rss-parser format)
  if (
    item.media_thumbnail &&
    Array.isArray(item.media_thumbnail) &&
    item.media_thumbnail.length > 0
  ) {
    return item.media_thumbnail[0].url || "";
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
function extractDescription(item: any): string {
  // Try content:encoded (full HTML)
  if (item.content && Array.isArray(item.content)) {
    for (const content of item.content) {
      if (content.type === "text/html") {
        return content.value || "";
      }
    }
  }

  // Try content_encoded (rss-parser format)
  if (item.content_encoded) {
    return item.content_encoded;
  }

  // Try itunes_summary (rss-parser format)
  if (item.itunes_summary) {
    return item.itunes_summary;
  }

  // Try itunes:summary (colon format)
  if (item["itunes:summary"]) {
    return item["itunes:summary"];
  }

  // Try description
  return item.summary || item.description || "";
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

  override async aggregate(articleLimit?: number): Promise<RawArticle[]> {
    if (!this.feed) {
      throw new Error("Feed not initialized");
    }

    const feedUrl = this.feed.identifier;
    logger.info({ feedUrl, feedId: this.feed.id }, "Fetching podcast RSS feed");

    // Fetch RSS feed
    const feed = await fetchFeed(feedUrl);
    const items = feed.items || [];

    if (items.length === 0) {
      logger.warn({ feedUrl }, "No entries found in podcast feed");
      return [];
    }

    // Apply article limit if specified
    const itemsToProcess = articleLimit ? items.slice(0, articleLimit) : items;

    logger.info(
      { feedUrl, itemCount: itemsToProcess.length },
      "Processing podcast episodes",
    );

    const articles: RawArticle[] = [];

    for (const item of itemsToProcess) {
      try {
        // Extract podcast-specific data
        const { url: audioUrl, type: audioType } = extractEnclosure(item);
        const duration = extractDuration(item);
        const imageUrl = extractImage(item);
        const description = extractDescription(item);

        if (!audioUrl) {
          logger.warn(
            { title: item.title },
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
        logger.error({ error, item }, "Error processing podcast episode");
        continue;
      }
    }

    logger.info(
      { feedUrl, articleCount: articles.length },
      "Podcast aggregation complete",
    );

    return articles;
  }
}
