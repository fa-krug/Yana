/**
 * Mein-MMO content extraction utilities.
 */

import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type pino from "pino";

import { extractContent } from "../base/extract";
import type { RawArticle } from "../base/types";
import { isTwitterUrl } from "../base/utils";
import {
  extractYouTubeVideoId,
  createYouTubeEmbedHtml,
} from "../base/utils/youtube";

/**
 * Extract Mein-MMO specific content.
 */
export async function extractMeinMmoContent(
  html: string,
  article: RawArticle,
  isMultiPage: boolean,
  selectorsToRemove: readonly string[],
  logger: pino.Logger,
  aggregatorId: string,
  feedId: number | null | undefined,
): Promise<string> {
  const $ = cheerio.load(html);

  // For multi-page articles, the HTML already contains combined content divs
  // For single-page articles, we need to extract the content first
  if (!isMultiPage) {
    // Extract content using base extractContent function
    const extracted = extractContent(html, {
      selectorsToRemove: Array.from(selectorsToRemove),
      contentSelector: "div.gp-entry-content",
    });
    // Reload with extracted content
    $.root().html(extracted);
  } else {
    // For multi-page, remove unwanted elements from the combined HTML
    for (const selector of selectorsToRemove) {
      $(selector).remove();
    }
  }

  // Handle multi-page articles: find ALL content divs, not just the first one
  const contentDivs = $("div.gp-entry-content");
  if (contentDivs.length === 0) {
    logger.warn(
      {
        step: "extractContent",
        subStep: "extractMeinMmo",
        aggregator: aggregatorId,
        feedId,
        url: article.url,
      },
      "Could not find article content",
    );
    // Fallback: return the HTML as-is
    return isMultiPage ? html : $.html();
  }

  // If multi-page, we'll have multiple divs - wrap them in a container
  let content: cheerio.Cheerio<AnyNode>;
  if (contentDivs.length > 1) {
    logger.info(
      {
        step: "extractContent",
        subStep: "extractMeinMmo",
        aggregator: aggregatorId,
        feedId,
        pageCount: contentDivs.length,
      },
      "Processing multi-page article",
    );
    // Create a wrapper div to contain all pages
    const wrapper = $('<div class="gp-entry-content"></div>');
    contentDivs.each((_, div) => {
      // Move all children from each page div into the wrapper
      $(div)
        .children()
        .each((_, child) => {
          wrapper.append(child);
        });
    });
    content = wrapper;
  } else {
    content = contentDivs.first();
  }

  // Convert YouTube embed placeholders to standard iframe embeds
  content.find("figure").each((_, figureEl) => {
    const $figure = $(figureEl);

    // Check if this is a YouTube embed by looking for YouTube-related classes
    const sanitizedClass = $figure.attr("data-sanitized-class") || "";
    const isYouTubeEmbed =
      sanitizedClass.includes("wp-block-embed-youtube") ||
      sanitizedClass.includes("is-provider-youtube") ||
      sanitizedClass.includes("embed-youtube");

    let videoId: string | null = null;

    if (isYouTubeEmbed) {
      // Try to extract video ID from embed content attribute
      const embedContentDiv = $figure.find(
        "[data-sanitized-data-embed-content]",
      );
      if (embedContentDiv.length > 0) {
        const embedContent = embedContentDiv.attr(
          "data-sanitized-data-embed-content",
        );
        if (embedContent) {
          // The content is HTML-encoded, try parsing the HTML first (cheerio will decode entities)
          try {
            // Create a temporary element to decode HTML entities
            const $temp = cheerio.load(`<div>${embedContent}</div>`);
            const iframe = $temp("iframe[src]");
            if (iframe.length > 0) {
              const iframeSrc = iframe.attr("src") || "";
              videoId = extractYouTubeVideoId(iframeSrc);
            }
          } catch {
            // If parsing fails, try regex extraction from the raw string
            // Look for patterns like: youtube-nocookie.com/embed/VIDEO_ID or youtube.com/embed/VIDEO_ID
            const embedMatch = embedContent.match(
              /(?:youtube-nocookie\.com\/embed\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
            );
            if (embedMatch && embedMatch[1]) {
              videoId = embedMatch[1];
            }
          }
        }
      }

      // If not found in embed content, try to extract from link
      if (!videoId) {
        const youtubeLinks = $figure.find("a[href]").filter((_, linkEl) => {
          const href = $(linkEl).attr("href") || "";
          return href.includes("youtube.com") || href.includes("youtu.be");
        });
        if (youtubeLinks.length > 0) {
          const youtubeLink = $(youtubeLinks[0]).attr("href") || "";
          videoId = extractYouTubeVideoId(youtubeLink);
        }
      }

      if (videoId) {
        // Create standard YouTube iframe embed
        const figcaption = $figure.find("figcaption");
        const captionHtml =
          figcaption.length > 0 ? $.html(figcaption) || "" : "";
        const embedHtml = createYouTubeEmbedHtml(videoId, captionHtml);
        $figure.replaceWith($(embedHtml));
        logger.debug(
          {
            step: "extractContent",
            subStep: "extractMeinMmo",
            aggregator: aggregatorId,
            feedId,
            videoId,
          },
          "Converted YouTube embed to iframe",
        );
        return; // Skip Twitter/Reddit processing for this figure
      }
    }

    // Fallback: Check for YouTube links even without specific class
    if (!videoId) {
      const youtubeLinks = $figure.find("a[href]").filter((_, linkEl) => {
        const href = $(linkEl).attr("href") || "";
        return href.includes("youtube.com") || href.includes("youtu.be");
      });
      if (youtubeLinks.length > 0) {
        const youtubeLink = $(youtubeLinks[0]).attr("href") || "";
        videoId = extractYouTubeVideoId(youtubeLink);
        if (videoId) {
          // Create standard YouTube iframe embed
          const figcaption = $figure.find("figcaption");
          const captionHtml =
            figcaption.length > 0 ? $.html(figcaption) || "" : "";
          const embedHtml = createYouTubeEmbedHtml(videoId, captionHtml);
          $figure.replaceWith($(embedHtml));
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
          return; // Skip Twitter/Reddit processing for this figure
        }
      }
    }

    // Check if this is a Twitter/X embed placeholder
    let twitterLink: string | undefined;
    const twitterLinks = $figure.find("a[href]").filter((_, linkEl) => {
      const href = $(linkEl).attr("href") || "";
      return isTwitterUrl(href);
    });
    if (twitterLinks.length > 0) {
      twitterLink = $(twitterLinks[0]).attr("href") || undefined;
    }

    if (twitterLink) {
      // Extract tweet URL (clean up tracking parameters)
      let cleanUrl = twitterLink;
      if (cleanUrl.includes("?")) {
        cleanUrl = cleanUrl.split("?")[0];
      }

      // Get caption text if available
      const figcaption = $figure.find("figcaption");
      const captionText = figcaption.length > 0 ? figcaption.text().trim() : "";

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

      $figure.replaceWith(newP);
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
    }
  });

  // Standardize Reddit embeds (separate loop as they have different structure)
  content.find("figure").each((_, figureEl) => {
    const $figure = $(figureEl);

    // Check if this is a Reddit embed by looking for provider-reddit class
    const sanitizedClass = $figure.attr("data-sanitized-class") || "";
    if (
      sanitizedClass.includes("provider-reddit") ||
      sanitizedClass.includes("embed-reddit")
    ) {
      // Extract Reddit URL from the embed
      let redditLink: string | undefined;
      const redditLinks = $figure.find("a[href]").filter((_, linkEl) => {
        const href = $(linkEl).attr("href") || "";
        return href.includes("reddit.com");
      });
      if (redditLinks.length > 0) {
        redditLink = $(redditLinks[0]).attr("href") || undefined;
      }

      if (redditLink) {
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
            const bgMatch = style.match(
              /background-image:\s*url\(['"]?([^'")]+)['"]?\)/,
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

        $figure.replaceWith(newP);
        logger.debug(
          {
            step: "extractContent",
            subStep: "extractMeinMmo",
            aggregator: aggregatorId,
            feedId,
            url: cleanUrl,
            hasImage: !!imageSrc,
          },
          "Converted Reddit embed to image plus link",
        );
      }
    }
  });

  // Remove empty elements
  content.find("p, div").each((_, el) => {
    const $el = $(el);
    if (!$el.text().trim() && $el.find("img").length === 0) {
      $el.remove();
    }
  });

  // Clean data attributes (except data-src and data-srcset)
  content.find("*").each((_, el) => {
    const $el = $(el);
    const attrs = $el.get(0)?.attribs || {};
    for (const attrName of Object.keys(attrs)) {
      if (
        attrName.startsWith("data-") &&
        attrName !== "data-src" &&
        attrName !== "data-srcset"
      ) {
        $el.removeAttr(attrName);
      }
    }
  });

  return content.html() || "";
}
