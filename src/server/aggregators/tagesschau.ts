/**
 * Tagesschau aggregator.
 *
 * Specialized aggregator for Tagesschau.de (German news).
 * Extracts article content using textabsatz paragraphs, embeds video/audio headers when present,
 * and filters out video news and podcasts.
 */

import { FullWebsiteAggregator } from "./full_website";
import type { RawArticle } from "./base/types";
import { fetchArticleContent } from "./base/fetch";
import { extractContent } from "./base/extract";
import { standardizeContentFormat } from "./base/process";
import { sanitizeHtml } from "./base/utils";
import { logger } from "../utils/logger";
import * as cheerio from "cheerio";

export class TagesschauAggregator extends FullWebsiteAggregator {
  override readonly id = "tagesschau";
  override readonly type: "managed" | "custom" | "social" = "managed";
  override readonly name = "Tagesschau";
  override readonly url = "https://www.tagesschau.de/xml/rss2/";
  override readonly description =
    "Tagesschau.de - German public broadcasting news website providing national and international news coverage.";
  override readonly prefillName = true;
  override readonly identifierEditable = false;

  override readonly waitForSelector = "p.textabsatz";
  override readonly selectorsToRemove = [
    "div.teaser",
    "div.socialbuttons",
    "aside",
    "nav",
    "button",
    "div.bigfive",
    "div.metatextline",
    "script",
    "style",
    "iframe",
    "noscript",
    "svg",
  ];

  protected override shouldSkipArticle(article: RawArticle): boolean {
    // Check title filters
    const skipTerms = [
      "tagesschau",
      "tagesthemen",
      "11KM-Podcast",
      "Podcast 15 Minuten",
    ];

    if (skipTerms.some((term) => article.title.includes(term))) {
      logger.info({ title: article.title }, "Skipping filtered content");
      return true;
    }

    // Check URL filters
    if (article.url.includes("bilder/blickpunkte")) {
      logger.info({ title: article.title }, "Skipping image gallery");
      return true;
    }

    return super.shouldSkipArticle(article);
  }

  /**
   * Extract video or audio header embed code from Tagesschau article page.
   *
   * Tagesschau uses a custom player system with:
   * - div.v-instance with data-v-type="MediaPlayer"
   * - data-v attribute containing JSON with media information
   * - embedCode in pluginData.sharing@web.embedCode
   *
   * Returns:
   *   HTML string with media embed iframe (and image if available), or null if no media found
   */
  private extractMediaHeader(soup: cheerio.CheerioAPI): string | null {
    // Look for Tagesschau media player instances
    // They use: <div class="v-instance" data-v-type="MediaPlayer" data-v="{...}">
    // Look for players in the header/teaser area first (teaser-top class)
    const mediaPlayers = soup('div[data-v-type="MediaPlayer"]').filter(
      (_, el) => {
        const classes = soup(el).attr("class") || "";
        return classes.toLowerCase().includes("mediaplayer");
      },
    );

    // Prefer teaser-top players (header media) over other players
    const teaserPlayers = mediaPlayers.filter((_, el) => {
      const classes = soup(el).attr("class") || "";
      return classes.includes("teaser-top");
    });

    const playersToCheck =
      teaserPlayers.length > 0 ? teaserPlayers : mediaPlayers;

    for (let i = 0; i < playersToCheck.length; i++) {
      const playerDiv = playersToCheck.eq(i);
      const dataV = playerDiv.attr("data-v");

      if (!dataV) {
        continue;
      }

      try {
        // Parse the JSON data (it's HTML-encoded)
        // Decode HTML entities: &quot; -> ", &#39; -> ', &amp; -> &
        let dataVDecoded = dataV
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">");
        const playerData = JSON.parse(dataVDecoded);

        // Check if it's video or audio
        const mc = playerData.mc || {};
        const streams = mc.streams || [];

        // Determine if it's audio-only or video
        const isAudioOnly =
          streams.length > 0 &&
          streams.every((stream: any) => stream.isAudioOnly === true);

        // Extract image/poster from player data
        let imageUrl: string | null = null;
        // Check common image fields in mc
        const imageFields = [
          "poster",
          "image",
          "thumbnail",
          "preview",
          "cover",
        ];
        for (const imageField of imageFields) {
          if (mc[imageField]) {
            imageUrl = mc[imageField];
            break;
          }
        }

        // If not found in mc, check streams
        if (!imageUrl) {
          for (const stream of streams) {
            for (const imageField of imageFields) {
              if (stream[imageField]) {
                imageUrl = stream[imageField];
                break;
              }
            }
            if (imageUrl) {
              break;
            }
          }
        }

        // If still not found, check for image elements near the player
        if (!imageUrl) {
          // Look for img tags in parent or sibling elements
          const parent = playerDiv.parent();
          if (parent && parent.length > 0) {
            // Check for images in the same container
            const img = parent.find("img").first();
            if (img.length > 0 && img.attr("src")) {
              imageUrl = img.attr("src") || null;
            }
            // Also check for images in previous/next siblings
            if (!imageUrl) {
              const prevSibling = playerDiv.prev();
              if (prevSibling.length > 0) {
                const img = prevSibling.find("img").first();
                if (img.length > 0 && img.attr("src")) {
                  imageUrl = img.attr("src") || null;
                }
              }
            }
          }
        }

        // Make image URL absolute if found
        if (imageUrl) {
          if (imageUrl.startsWith("//")) {
            imageUrl = "https:" + imageUrl;
          } else if (imageUrl.startsWith("/")) {
            imageUrl = "https://www.tagesschau.de" + imageUrl;
          }
          logger.debug({ imageUrl }, "Found player image");
        }

        // Try to extract embed code from pluginData
        const pluginData = playerData.pluginData || {};
        const sharingData = pluginData["sharing@web"] || {};
        let embedCode = sharingData.embedCode || "";

        if (embedCode) {
          // The embed code is HTML-encoded, decode it
          const embedCodeDecoded = embedCode
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">");
          // Extract iframe src from embed code
          const embedSoup = cheerio.load(embedCodeDecoded);
          const iframe = embedSoup("iframe").first();
          if (iframe.length > 0 && iframe.attr("src")) {
            let src = iframe.attr("src") || "";
            // Remove $params$ placeholder if present
            src = src.replace("$params$", "");
            // Make sure URL is absolute
            if (src.startsWith("//")) {
              src = "https:" + src;
            } else if (src.startsWith("/")) {
              src = "https://www.tagesschau.de" + src;
            }
            // Adjust height for audio (smaller) vs video
            const height = isAudioOnly ? "200" : "315";
            // Build media header with iframe
            // For audio with image: use image as background
            if (isAudioOnly && imageUrl) {
              return (
                `<div class="media-header" style="position: relative; background-image: url('${imageUrl}'); background-size: cover; background-position: center; padding: 20px; border-radius: 8px;">` +
                `<iframe src="${src}" width="100%" height="${height}" ` +
                `frameborder="0" allowfullscreen scrolling="no" style="background: rgba(0,0,0,0.7); border-radius: 4px;"></iframe>` +
                `</div>`
              );
            } else {
              // For video, just embed the iframe (it may have its own poster)
              return (
                `<div class="media-header">` +
                `<iframe src="${src}" width="100%" height="${height}" ` +
                `frameborder="0" allowfullscreen scrolling="no"></iframe>` +
                `</div>`
              );
            }
          }
        }

        // Fallback: construct player from media URL if available
        for (const stream of streams) {
          const mediaItems = stream.media || [];
          for (const mediaItem of mediaItems) {
            const url = mediaItem.url;
            const mimeType = mediaItem.mimeType || "";

            if (!url) {
              continue;
            }

            // Build media header with player (image merged as poster/background)
            if (isAudioOnly && mimeType.toLowerCase().includes("audio")) {
              // Create HTML5 audio player with image as background
              if (imageUrl) {
                return (
                  `<div class="media-header" style="position: relative; background-image: url('${imageUrl}'); background-size: cover; background-position: center; padding: 20px; border-radius: 8px;">` +
                  `<audio controls style="width: 100%; background: rgba(0,0,0,0.7); border-radius: 4px;">` +
                  `<source src="${url}" type="${mimeType}">` +
                  `Your browser does not support the audio element.` +
                  `</audio>` +
                  `</div>`
                );
              } else {
                return (
                  `<div class="media-header">` +
                  `<audio controls style="width: 100%;">` +
                  `<source src="${url}" type="${mimeType}">` +
                  `Your browser does not support the audio element.` +
                  `</audio>` +
                  `</div>`
                );
              }
            } else if (
              !isAudioOnly &&
              mimeType.toLowerCase().includes("video")
            ) {
              // Create HTML5 video player with poster image
              const posterAttr = imageUrl ? `poster="${imageUrl}"` : "";
              return (
                `<div class="media-header">` +
                `<video controls ${posterAttr} style="max-width: 100%; height: auto; width: 100%;">` +
                `<source src="${url}" type="${mimeType}">` +
                `Your browser does not support the video element.` +
                `</video>` +
                `</div>`
              );
            }
          }
        }
      } catch (error) {
        logger.debug({ error }, "Failed to parse Tagesschau media player data");
        continue;
      }
    }

    return null;
  }

  override async aggregate(articleLimit?: number): Promise<RawArticle[]> {
    if (!this.feed) {
      throw new Error("Feed not initialized");
    }

    // Call parent aggregate to get base articles
    const articles = await super.aggregate(articleLimit);

    // Process each article with Tagesschau-specific logic
    for (const article of articles) {
      try {
        // Skip if article already exists (unless force refresh)
        if (this.isExistingUrl(article.url)) {
          logger.debug(
            {
              url: article.url,
              title: article.title,
              aggregator: this.id,
              step: "skip_existing",
            },
            "Skipping existing article (will not fetch content)",
          );
          continue;
        }

        // Fetch article HTML
        const html = await fetchArticleContent(article.url, {
          timeout: this.fetchTimeout,
          waitForSelector: this.waitForSelector,
        });

        // Extract media header first (before content extraction)
        const soup = cheerio.load(html);
        const mediaHeader = this.extractMediaHeader(soup);

        // Extract content from textabsatz paragraphs
        const extracted = this.extractContentFromTextabsatz(html);

        // Process content
        let $ = cheerio.load(extracted);

        // Remove empty elements
        $("p, div, span").each((_, el) => {
          const $el = $(el);
          if (!$el.text().trim() && !$el.find("img").length) {
            $el.remove();
          }
        });

        let content = $.html();

        // Sanitize HTML (remove scripts, rename attributes)
        content = sanitizeHtml(content);

        // Prepend media header if found
        if (mediaHeader) {
          content = mediaHeader + content;
          logger.debug(
            { url: article.url },
            "Prepended media header to article content",
          );
        }

        // Standardize format (add source link, but skip title image if media header exists)
        const generateTitleImage =
          !mediaHeader && (this.feed?.generateTitleImage ?? true);
        const addSourceFooter = this.feed?.addSourceFooter ?? true;
        article.content = await standardizeContentFormat(
          content,
          article,
          article.url,
          generateTitleImage,
          addSourceFooter,
        );
      } catch (error) {
        logger.error(
          { error, url: article.url },
          "Error processing Tagesschau article",
        );
        // Continue with original content if processing fails
      }
    }

    return articles;
  }

  /**
   * Extract content from textabsatz paragraphs.
   */
  private extractContentFromTextabsatz(html: string): string {
    try {
      const $ = cheerio.load(html);
      const content = $('<div class="article-content"></div>');

      // Extract text content
      $("p, h2").each((_, element) => {
        const $el = $(element);

        // Skip if parent has certain classes
        const parent = $el.parent();
        if (parent.length > 0) {
          const parentClasses = parent.attr("class") || "";
          if (
            parentClasses.includes("teaser") ||
            parentClasses.includes("bigfive") ||
            parentClasses.includes("accordion") ||
            parentClasses.includes("related")
          ) {
            return;
          }
        }

        if (element.tagName === "p" && $el.attr("class")) {
          const classes = $el.attr("class") || "";
          if (classes.includes("textabsatz")) {
            const newP = $el.clone();
            newP.removeAttr("class");
            content.append(newP);
          }
        } else if (element.tagName === "h2") {
          const classes = $el.attr("class") || "";
          if (classes.includes("trenner")) {
            const newH2 = $("<h2></h2>");
            newH2.text($el.text().trim());
            content.append(newH2);
          }
        }
      });

      return content.html() || "";
    } catch (error) {
      logger.error({ error }, "Extraction failed");
      return html; // Fallback to original HTML
    }
  }
}
