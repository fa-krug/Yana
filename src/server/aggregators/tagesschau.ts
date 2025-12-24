/**
 * Tagesschau aggregator.
 *
 * Specialized aggregator for Tagesschau.de (German news).
 * Extracts article content using textabsatz paragraphs, embeds video/audio headers when present,
 * and filters out video news and podcasts.
 */

import * as cheerio from "cheerio";

import { logger } from "../utils/logger";

import type { RawArticle } from "./base/types";
import { sanitizeHtml, createHeaderElementFromUrl } from "./base/utils";
import { FullWebsiteAggregator } from "./full_website";

export class TagesschauAggregator extends FullWebsiteAggregator {
  override readonly id = "tagesschau";
  override readonly type: "managed" | "custom" | "social" = "managed";
  override readonly name = "Tagesschau";
  override readonly url = "https://www.tagesschau.de/xml/rss2/";
  override readonly description =
    "Tagesschau.de - German public broadcasting news website providing national and international news coverage.";
  override readonly prefillName = true;
  override readonly identifierEditable = false;

  // Store original HTML for media header extraction
  private originalHtmlCache: Map<string, string> = new Map();

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
    // Skip livestream articles
    if (article.title.includes("Livestream:")) {
      logger.info({ title: article.title }, "Skipping livestream article");
      return true;
    }

    // Check title filters
    const skipTerms = [
      "tagesschau",
      "tagesthemen",
      "11KM-Podcast",
      "Podcast 15 Minuten",
      "15 Minuten:",
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
   *   For audio with images, the image is converted to base64 and placed above the player in a separate div
   */
  private async extractMediaHeader(
    soup: cheerio.CheerioAPI,
  ): Promise<string | null> {
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
        const dataVDecoded = dataV
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
          streams.every(
            (stream: { isAudioOnly?: boolean }) => stream.isAudioOnly === true,
          );

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
        const embedCode = sharingData.embedCode || "";

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
            // For audio with image: convert image to base64 and place above player
            if (isAudioOnly && imageUrl) {
              try {
                // Use unified function to create header element (handles compression and base64)
                const headerElement = await createHeaderElementFromUrl(
                  imageUrl,
                  "Article image",
                );

                if (headerElement) {
                  // Extract img tag from the returned HTML (removes <p> wrapper)
                  const imgMatch = headerElement.match(/<img[^>]*>/);
                  if (imgMatch) {
                    // Extract src from the img tag and create custom structure
                    const srcMatch = imgMatch[0].match(/src=["']([^"']+)["']/);
                    if (srcMatch) {
                      const dataUri = srcMatch[1];
                      // Create separate divs: image above, player below
                      return (
                        `<header class="media-header">` +
                        `<div class="media-image"><img src="${dataUri}" alt="Article image" style="max-width: 100%; height: auto; border-radius: 8px;"></div>` +
                        `<div class="media-player" style="width: 100%;"><iframe src="${src}" width="100%" height="${height}" ` +
                        `frameborder="0" allowfullscreen scrolling="no"></iframe></div>` +
                        `</header>`
                      );
                    }
                  }
                }
              } catch (error) {
                logger.warn(
                  { error, imageUrl },
                  "Failed to convert audio image to base64, using URL fallback",
                );
              }
              // Fallback: use URL directly if conversion failed or returned null
              return (
                `<header class="media-header">` +
                `<div class="media-image"><img src="${imageUrl}" alt="Article image" style="max-width: 100%; height: auto; border-radius: 8px;"></div>` +
                `<div class="media-player" style="width: 100%;"><iframe src="${src}" width="100%" height="${height}" ` +
                `frameborder="0" allowfullscreen scrolling="no"></iframe></div>` +
                `</header>`
              );
            } else {
              // For video, just embed the iframe (it may have its own poster)
              return (
                `<header class="media-header">` +
                `<div class="media-player" style="width: 100%;"><iframe src="${src}" width="100%" height="${height}" ` +
                `frameborder="0" allowfullscreen scrolling="no"></iframe></div>` +
                `</header>`
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

            // Build media header with player (image converted to base64 above player)
            if (isAudioOnly && mimeType.toLowerCase().includes("audio")) {
              // Create HTML5 audio player with image above (converted to base64)
              if (imageUrl) {
                try {
                  // Use unified function to create header element (handles compression and base64)
                  const headerElement = await createHeaderElementFromUrl(
                    imageUrl,
                    "Article image",
                  );

                  if (headerElement) {
                    // Extract img tag from the returned HTML (removes <p> wrapper)
                    const imgMatch = headerElement.match(/<img[^>]*>/);
                    if (imgMatch) {
                      // Extract src from the img tag and create custom structure
                      const srcMatch =
                        imgMatch[0].match(/src=["']([^"']+)["']/);
                      if (srcMatch) {
                        const dataUri = srcMatch[1];
                        // Create separate divs: image above, player below
                        return (
                          `<header class="media-header">` +
                          `<div class="media-image"><img src="${dataUri}" alt="Article image" style="max-width: 100%; height: auto; border-radius: 8px;"></div>` +
                          `<div class="media-player" style="width: 100%;"><audio controls preload="auto" style="width: 100%;">` +
                          `<source src="${url}" type="${mimeType}">` +
                          `Your browser does not support the audio element.` +
                          `</audio></div>` +
                          `</header>`
                        );
                      }
                    }
                  }
                } catch (error) {
                  logger.warn(
                    { error, imageUrl },
                    "Failed to convert audio image to base64, using URL fallback",
                  );
                }
                // Fallback: use URL directly if conversion failed or returned null
                return (
                  `<header class="media-header">` +
                  `<div class="media-image"><img src="${imageUrl}" alt="Article image" style="max-width: 100%; height: auto; border-radius: 8px;"></div>` +
                  `<div class="media-player" style="width: 100%;"><audio controls preload="auto" style="width: 100%;">` +
                  `<source src="${url}" type="${mimeType}">` +
                  `Your browser does not support the audio element.` +
                  `</audio></div>` +
                  `</header>`
                );
              } else {
                return (
                  `<header class="media-header">` +
                  `<audio controls preload="auto" style="width: 100%;">` +
                  `<source src="${url}" type="${mimeType}">` +
                  `Your browser does not support the audio element.` +
                  `</audio>` +
                  `</header>`
                );
              }
            } else if (
              !isAudioOnly &&
              mimeType.toLowerCase().includes("video")
            ) {
              // Create HTML5 video player with poster image
              const posterAttr = imageUrl ? `poster="${imageUrl}"` : "";
              return (
                `<header class="media-header">` +
                `<div class="media-player" style="width: 100%;"><video controls preload="auto" ${posterAttr} style="width: 100%;">` +
                `<source src="${url}" type="${mimeType}">` +
                `Your browser does not support the video element.` +
                `</video></div>` +
                `</header>`
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

  /**
   * Override fetchArticleContentInternal to cache original HTML for media header extraction.
   */
  protected override async fetchArticleContentInternal(
    url: string,
    article: RawArticle,
  ): Promise<string> {
    const html = await super.fetchArticleContentInternal(url, article);
    // Cache original HTML for media header extraction
    this.originalHtmlCache.set(article.url, html);
    return html;
  }

  /**
   * Override processContent to add Tagesschau-specific media header extraction.
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
      "Processing Tagesschau content with media header",
    );

    // Extract media header from cached original HTML
    let mediaHeader: string | null = null;
    const originalHtml = this.originalHtmlCache.get(article.url);
    if (originalHtml) {
      try {
        const soup = cheerio.load(originalHtml);
        mediaHeader = await this.extractMediaHeader(soup);
        // Clear cache after use
        this.originalHtmlCache.delete(article.url);
      } catch (error) {
        this.logger.debug(
          {
            step: "enrichArticles",
            subStep: "processContent",
            aggregator: this.id,
            feedId: this.feed?.id,
            url: article.url,
            error,
          },
          "Failed to extract media header, continuing without it",
        );
      }
    }

    // Process content (remove empty elements, sanitize)
    const $ = cheerio.load(html);

    // Remove empty elements
    $("p, div, span").each((_, el) => {
      const $el = $(el);
      if (!$el.text().trim() && !$el.find("img").length) {
        $el.remove();
      }
    });

    let content = $.html() || "";

    // Sanitize HTML (remove scripts, rename attributes)
    content = sanitizeHtml(content);

    // Prepend media header if found
    if (mediaHeader) {
      content = mediaHeader + content;
      this.logger.debug(
        {
          step: "enrichArticles",
          subStep: "processContent",
          aggregator: this.id,
          feedId: this.feed?.id,
          url: article.url,
        },
        "Prepended media header to article content",
      );
    }

    // Use base processContent for standardization
    // standardizeContentFormat will automatically detect existing header via <header> tag
    const generateTitleImage = this.feed?.generateTitleImage ?? true;
    const addSourceFooter = this.feed?.addSourceFooter ?? true;

    // Call base processContent - it will check for existing header and skip if found
    const { processContent: processContentUtil } =
      await import("./base/process");
    const result = await processContentUtil(
      content,
      article,
      generateTitleImage,
      addSourceFooter,
    );

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
      "Tagesschau content processed",
    );

    return result;
  }

  /**
   * Override extractContent to use Tagesschau-specific extraction.
   */
  protected override async extractContent(
    html: string,
    article: RawArticle,
  ): Promise<string> {
    const startTime = Date.now();
    this.logger.debug(
      {
        step: "extractContent",
        subStep: "extractTagesschau",
        aggregator: this.id,
        feedId: this.feed?.id,
        url: article.url,
      },
      "Extracting Tagesschau content",
    );

    // Use Tagesschau-specific extraction
    const extracted = this.extractContentFromTextabsatz(html);

    // Use base removeElementsBySelectors for additional cleanup
    const result = await super.removeElementsBySelectors(extracted, article);

    const elapsed = Date.now() - startTime;
    this.logger.debug(
      {
        step: "extractContent",
        subStep: "extractTagesschau",
        aggregator: this.id,
        feedId: this.feed?.id,
        url: article.url,
        elapsed,
      },
      "Tagesschau content extracted",
    );

    return result;
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
