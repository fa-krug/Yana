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
   */
  private async extractMediaHeader(
    soup: cheerio.CheerioAPI,
  ): Promise<string | null> {
    const playersToCheck = this.getMediaPlayers(soup);

    for (let i = 0; i < playersToCheck.length; i++) {
      const playerDiv = playersToCheck.eq(i);
      const dataV = playerDiv.attr("data-v");
      if (!dataV) continue;

      try {
        const playerData = this.parsePlayerData(dataV);
        const streams = playerData.mc?.streams || [];
        const isAudioOnly = streams.length > 0 && streams.every((s: any) => s.isAudioOnly === true);
        const imageUrl = this.getPlayerImage(playerDiv, playerData.mc || {});

        // Try to extract embed code from pluginData
        const embedCode = playerData.pluginData?.["sharing@web"]?.embedCode;
        if (embedCode) {
          const result = await this.buildHeaderFromEmbedCode(embedCode, isAudioOnly, imageUrl);
          if (result) return result;
        }

        // Fallback: construct player from media URL if available
        const result = await this.buildHeaderFromStreams(streams, isAudioOnly, imageUrl);
        if (result) return result;
      } catch (error) {
        logger.debug({ error }, "Failed to parse Tagesschau media player data");
      }
    }

    return null;
  }

  private getMediaPlayers(soup: cheerio.CheerioAPI): cheerio.Cheerio<any> {
    const mediaPlayers = soup('div[data-v-type="MediaPlayer"]').filter((_, el) => {
      return (soup(el).attr("class") || "").toLowerCase().includes("mediaplayer");
    });

    const teaserPlayers = mediaPlayers.filter((_, el) => (soup(el).attr("class") || "").includes("teaser-top"));
    return teaserPlayers.length > 0 ? teaserPlayers : mediaPlayers;
  }

  private parsePlayerData(dataV: string): any {
    const decoded = dataV
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    return JSON.parse(decoded);
  }

  private getPlayerImage(playerDiv: cheerio.Cheerio<any>, mc: any): string | null {
    let imageUrl = this.getPlayerImageFromMetadata(mc);

    if (!imageUrl) {
      imageUrl = this.getPlayerImageFromDOM(playerDiv);
    }

    if (imageUrl) {
      if (imageUrl.startsWith("//")) return "https:" + imageUrl;
      if (imageUrl.startsWith("/")) return "https://www.tagesschau.de" + imageUrl;
    }
    return imageUrl;
  }

  private getPlayerImageFromMetadata(mc: any): string | null {
    const fields = ["poster", "image", "thumbnail", "preview", "cover"];

    // Check main mc object
    for (const field of fields) {
      if (mc[field]) return mc[field];
    }

    // Check streams
    if (mc.streams) {
      for (const stream of mc.streams) {
        for (const field of fields) {
          if (stream[field]) return stream[field];
        }
      }
    }

    return null;
  }

  private getPlayerImageFromDOM(playerDiv: cheerio.Cheerio<any>): string | null {
    const parent = playerDiv.parent();
    if (parent && parent.length > 0) {
      const img = parent.find("img").first();
      if (img.length > 0) return img.attr("src") || null;
    }

    const prev = playerDiv.prev();
    if (prev && prev.length > 0) {
      const img = prev.find("img").first();
      if (img.length > 0) return img.attr("src") || null;
    }

    return null;
  }

  private async buildHeaderFromEmbedCode(embedCode: string, isAudioOnly: boolean, imageUrl: string | null): Promise<string | null> {
    const decoded = embedCode.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    const $ = cheerio.load(decoded);
    const iframe = $("iframe").first();
    let src = iframe.attr("src");
    if (!src) return null;

    src = src.replace("$params$", "");
    if (src.startsWith("//")) src = "https:" + src;
    else if (src.startsWith("/")) src = "https://www.tagesschau.de" + src;

    const height = isAudioOnly ? "200" : "315";
    const playerHtml = `<div class="media-player" style="width: 100%;"><iframe src="${src}" width="100%" height="${height}" frameborder="0" allowfullscreen scrolling="no"></iframe></div>`;

    if (isAudioOnly && imageUrl) {
      const imgPart = await this.buildBase64Image(imageUrl);
      return `<header class="media-header">${imgPart}${playerHtml}</header>`;
    }
    return `<header class="media-header">${playerHtml}</header>`;
  }

  private async buildHeaderFromStreams(streams: any[], isAudioOnly: boolean, imageUrl: string | null): Promise<string | null> {
    if (isAudioOnly) {
      const audioMedia = this.findMediaByMimeType(streams, "audio");
      if (audioMedia) {
        const imgPart = imageUrl ? await this.buildBase64Image(imageUrl) : "";
        return `<header class="media-header">${imgPart}<div class="media-player" style="width: 100%;"><audio controls preload="auto" style="width: 100%;"><source src="${audioMedia.url}" type="${audioMedia.mimeType}">Your browser does not support the audio element.</audio></div></header>`;
      }
    } else {
      const videoMedia = this.findMediaByMimeType(streams, "video");
      if (videoMedia) {
        const poster = imageUrl ? `poster="${imageUrl}"` : "";
        return `<header class="media-header"><div class="media-player" style="width: 100%;"><video controls preload="auto" ${poster} style="width: 100%;"><source src="${videoMedia.url}" type="${videoMedia.mimeType}">Your browser does not support the video element.</video></div></header>`;
      }
    }
    return null;
  }

  private findMediaByMimeType(streams: any[], type: string): { url: string; mimeType: string } | null {
    for (const stream of streams) {
      for (const media of (stream.media || [])) {
        if (media.url && (media.mimeType || "").toLowerCase().includes(type)) {
          return { url: media.url, mimeType: media.mimeType };
        }
      }
    }
    return null;
  }

  private async buildBase64Image(imageUrl: string): Promise<string> {
    try {
      const headerElement = await createHeaderElementFromUrl(imageUrl, "Article image");
      if (headerElement) {
        const srcMatch = /src=["']([^"']+)["']/.exec(headerElement);
        if (srcMatch) {
          return `<div class="media-image"><img src="${srcMatch[1]}" alt="Article image" style="max-width: 100%; height: auto; border-radius: 8px;"></div>`;
        }
      }
    } catch { /* fallback */ }
    return `<div class="media-image"><img src="${imageUrl}" alt="Article image" style="max-width: 100%; height: auto; border-radius: 8px;"></div>`;
  }

  protected override async fetchArticleContentInternal(url: string, article: RawArticle): Promise<string> {
    const html = await super.fetchArticleContentInternal(url, article);
    this.originalHtmlCache.set(article.url, html);
    return html;
  }

  protected override async processContent(html: string, article: RawArticle): Promise<string> {
    let mediaHeader: string | null = null;
    const originalHtml = this.originalHtmlCache.get(article.url);

    if (originalHtml) {
      try {
        mediaHeader = await this.extractMediaHeader(cheerio.load(originalHtml));
        this.originalHtmlCache.delete(article.url);
      } catch (error) {
        logger.debug({ error, url: article.url }, "Failed to extract media header");
      }
    }

    const $ = cheerio.load(html);
    $("p, div, span").each((_, el) => {
      const $el = $(el);
      if (!$el.text().trim() && !$el.find("img").length) $el.remove();
    });

    let content = sanitizeHtml($.html() || "");
    if (mediaHeader) content = mediaHeader + content;

    const { processContent: processContentUtil } = await import("./base/process");
    return await processContentUtil(content, article, this.feed?.generateTitleImage ?? true, this.feed?.addSourceFooter ?? true);
  }

  protected override async extractContent(html: string, article: RawArticle): Promise<string> {
    const extracted = this.extractContentFromTextabsatz(html);
    return await super.removeElementsBySelectors(extracted, article);
  }

  private extractContentFromTextabsatz(html: string): string {
    try {
      const $ = cheerio.load(html);
      const content = $('<div class="article-content"></div>');

      $("p, h2").each((_, element) => {
        const $el = $(element);
        if (this.shouldSkipElement($el)) return;

        if (element.tagName === "p" && ($el.attr("class") || "").includes("textabsatz")) {
          content.append($el.clone().removeAttr("class"));
        } else if (element.tagName === "h2" && ($el.attr("class") || "").includes("trenner")) {
          content.append($("<h2></h2>").text($el.text().trim()));
        }
      });

      return content.html() || "";
    } catch (error) {
      logger.error({ error }, "Extraction failed");
      return html;
    }
  }

  private shouldSkipElement($el: cheerio.Cheerio<any>): boolean {
    const parent = $el.parent();
    if (parent.length === 0) return false;
    const classes = parent.attr("class") || "";
    return ["teaser", "bigfive", "accordion", "related"].some(c => classes.includes(c));
  }
}
