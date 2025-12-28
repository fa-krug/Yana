/**
 * Concrete strategy implementations for processing Mein-MMO figure elements.
 */

import * as cheerio from "cheerio";

import { isTwitterUrl } from "../base/utils";
import {
  extractYouTubeVideoId,
  createYouTubeEmbedHtml,
} from "../base/utils/youtube";

import type {
  FigureProcessingContext,
  FigureProcessingResult,
  FigureProcessingStrategy,
} from "./figure-processing-strategy";

/**
 * Extract video ID from embed content attribute.
 */
function extractVideoIdFromEmbedContent(figure: cheerio.Cheerio<cheerio.AnyNode>): string | null {
  const embedContentDiv = figure.find("[data-sanitized-data-embed-content]");
  if (embedContentDiv.length === 0) return null;

  const embedContent = embedContentDiv.attr("data-sanitized-data-embed-content");
  if (!embedContent) return null;

  try {
    const $temp = cheerio.load(`<div>${embedContent}</div>`);
    const iframe = $temp("iframe[src]");
    if (iframe.length > 0) return extractYouTubeVideoId(iframe.attr("src") || "");
  } catch { /* Fallback to regex */ }

  const match = /(?:youtube-nocookie\.com\/embed\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/.exec(embedContent);
  return match ? match[1] : null;
}

/**
 * Extract video ID from any YouTube link in the figure.
 */
function extractVideoIdFromLinks(figure: cheerio.Cheerio<cheerio.AnyNode>): string | null {
  const youtubeLinks = figure.find("a[href]").filter((_, linkEl) => {
    const href = cheerio.load("")(linkEl).attr("href") || "";
    return href.includes("youtube.com") || href.includes("youtu.be");
  });
  if (youtubeLinks.length === 0) return null;
  return extractYouTubeVideoId(cheerio.load("")(youtubeLinks[0]).attr("href") || "");
}

/**
 * Processes YouTube embed figures with embed content attribute.
 */
export class YouTubeEmbedStrategy implements FigureProcessingStrategy {
  canHandle(context: FigureProcessingContext): boolean {
    const sanitizedClass = context.figure.attr("data-sanitized-class") || "";
    return (
      sanitizedClass.includes("wp-block-embed-youtube") ||
      sanitizedClass.includes("is-provider-youtube") ||
      sanitizedClass.includes("embed-youtube")
    );
  }

  process(context: FigureProcessingContext): FigureProcessingResult {
    const { figure: $figure, $, logger, aggregatorId, feedId } = context;

    const videoId = extractVideoIdFromEmbedContent($figure) || extractVideoIdFromLinks($figure);

    if (videoId) {
      const figcaption = $figure.find("figcaption");
      const captionHtml = figcaption.length > 0 ? $.html(figcaption) || "" : "";
      const embedHtml = createYouTubeEmbedHtml(videoId, captionHtml);

      logger.debug({ step: "extractContent", subStep: "extractMeinMmo", aggregator: aggregatorId, feedId, videoId }, "Converted YouTube embed to iframe");
      return { replacementHtml: embedHtml, success: true };
    }

    return { replacementHtml: null, success: false };
  }
}

/**
 * Fallback strategy for YouTube links without specific class markers.
 */
export class YouTubeFallbackStrategy implements FigureProcessingStrategy {
  canHandle(context: FigureProcessingContext): boolean {
    // This is a fallback - only handle if we find YouTube links
    const youtubeLinks = context.figure.find("a[href]").filter((_, linkEl) => {
      const href = context.$(linkEl).attr("href") || "";
      return href.includes("youtube.com") || href.includes("youtu.be");
    });
    return youtubeLinks.length > 0;
  }

  process(context: FigureProcessingContext): FigureProcessingResult {
    const { figure: $figure, $, logger, aggregatorId, feedId } = context;

    const youtubeLinks = $figure.find("a[href]").filter((_, linkEl) => {
      const href = $(linkEl).attr("href") || "";
      return href.includes("youtube.com") || href.includes("youtu.be");
    });

    if (youtubeLinks.length > 0) {
      const youtubeLink = $(youtubeLinks[0]).attr("href") || "";
      const videoId = extractYouTubeVideoId(youtubeLink);

      if (videoId) {
        // Create standard YouTube iframe embed
        const figcaption = $figure.find("figcaption");
        const captionHtml =
          figcaption.length > 0 ? $.html(figcaption) || "" : "";
        const embedHtml = createYouTubeEmbedHtml(videoId, captionHtml);

        logger.debug(
          {
            step: "extractContent",
            subStep: "extractMeinMmo",
            aggregator: aggregatorId,
            feedId,
            videoId,
          },
          "Converted YouTube embed to iframe (fallback)",
        );

        return { replacementHtml: embedHtml, success: true };
      }
    }

    return { replacementHtml: null, success: false };
  }
}

/**
 * Processes Twitter/X embed figures.
 */
export class TwitterEmbedStrategy implements FigureProcessingStrategy {
  canHandle(context: FigureProcessingContext): boolean {
    const twitterLinks = context.figure.find("a[href]").filter((_, linkEl) => {
      const href = context.$(linkEl).attr("href") || "";
      return isTwitterUrl(href);
    });
    return twitterLinks.length > 0;
  }

  process(context: FigureProcessingContext): FigureProcessingResult {
    const { figure: $figure, $, logger, aggregatorId, feedId } = context;

    const twitterLinks = $figure.find("a[href]").filter((_, linkEl) => {
      const href = $(linkEl).attr("href") || "";
      return isTwitterUrl(href);
    });

    if (twitterLinks.length === 0) {
      return { replacementHtml: null, success: false };
    }

    const twitterLink = $(twitterLinks[0]).attr("href") || "";

    // Extract tweet URL (clean up tracking parameters)
    let cleanUrl = twitterLink;
    if (cleanUrl.includes("?")) {
      cleanUrl = cleanUrl.split("?")[0];
    }

    // Get caption text if available
    const figcaption = $figure.find("figcaption");
    const captionText =
      figcaption.length > 0 ? figcaption.text().trim() : "";

    // Replace figure with clean link
    const newP = $("<p></p>");
    const newLink = $("<a></a>")
      .attr("href", cleanUrl)
      .attr("target", "_blank")
      .attr("rel", "noopener")
      .text(`View on X/Twitter: ${cleanUrl}`);
    newP.append(newLink);

    if (captionText) {
      newP.append("<br>");
      const captionSpan = $("<em></em>").text(captionText);
      newP.append(captionSpan);
    }

    logger.debug(
      {
        step: "extractContent",
        subStep: "extractMeinMmo",
        aggregator: aggregatorId,
        feedId,
        url: cleanUrl,
      },
      "Converted Twitter/X embed to link",
    );

    return { replacementHtml: $.html(newP), success: true };
  }
}

/**
 * Processes Reddit embed figures.
 */
export class RedditEmbedStrategy implements FigureProcessingStrategy {
  canHandle(context: FigureProcessingContext): boolean {
    const sanitizedClass = context.figure.attr("data-sanitized-class") || "";
    return (
      sanitizedClass.includes("provider-reddit") ||
      sanitizedClass.includes("embed-reddit")
    );
  }

  process(context: FigureProcessingContext): FigureProcessingResult {
    const { figure: $figure, $, logger, aggregatorId, feedId } = context;

    // Extract Reddit URL from the embed
    const redditLinks = $figure.find("a[href]").filter((_, linkEl) => {
      const href = $(linkEl).attr("href") || "";
      return href.includes("reddit.com");
    });

    if (redditLinks.length === 0) {
      return { replacementHtml: null, success: false };
    }

    const redditLink = $(redditLinks[0]).attr("href") || "";

    // Clean up tracking parameters
    let cleanUrl = redditLink;
    if (cleanUrl.includes("?")) {
      cleanUrl = cleanUrl.split("?")[0];
    }

    // Look for an image in the embed (check multiple possible locations)
    let imageSrc: string | null = null;
    let imageAlt = "Reddit post";

    // First, try to find an img tag
    const embedImage = $figure.find("img").first();
    if (embedImage.length > 0) {
      imageSrc =
        embedImage.attr("src") || embedImage.attr("data-src") || null;
      imageAlt =
        embedImage.attr("alt") || embedImage.attr("title") || "Reddit post";
    }

    // If no image found, try to extract from background-image style
    if (!imageSrc) {
      const elementsWithBg = $figure.find("[style*='background-image']");
      if (elementsWithBg.length > 0) {
        const style = elementsWithBg.first().attr("style") || "";
        const bgMatch = /background-image:\s*url\(['"]?([^'")]+)['"]?\)/.exec(
          style,
        );
        if (bgMatch && bgMatch[1]) {
          imageSrc = bgMatch[1];
        }
      }
    }

    // Create container for image + link
    const newP = $("<p></p>");

    if (imageSrc) {
      // Create image wrapped in link
      const imageLink = $("<a></a>")
        .attr("href", cleanUrl)
        .attr("target", "_blank")
        .attr("rel", "noopener");
      const img = $("<img></img>")
        .attr("src", imageSrc)
        .attr("alt", imageAlt)
        .attr(
          "style",
          "max-width: 100%; height: auto; display: block; margin-bottom: 0.5em;",
        );
      imageLink.append(img);
      newP.append(imageLink);
    }

    // Add text link
    const newLink = $("<a></a>")
      .attr("href", cleanUrl)
      .attr("target", "_blank")
      .attr("rel", "noopener")
      .text("View on Reddit");
    newP.append(newLink);

    logger.debug(
      {
        step: "extractContent",
        subStep: "extractMeinMmo",
        aggregator: aggregatorId,
        feedId,
        url: cleanUrl,
        hasImage: !!imageSrc,
      },
      "Converted Reddit embed to link",
    );

    return { replacementHtml: $.html(newP), success: true };
  }
}
