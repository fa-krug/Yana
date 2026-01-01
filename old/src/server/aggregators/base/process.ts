/**
 * Content processing utilities.
 */

import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import sharp from "sharp";

import { logger } from "@server/utils/logger";

import { ArticleSkipError } from "./exceptions";
import type { RawArticle } from "./types";
import {
  compressImage,
  MAX_HEADER_IMAGE_WIDTH,
  MAX_HEADER_IMAGE_HEIGHT,
  extractYouTubeVideoId,
  createHeaderElementFromUrl,
} from "./utils";

/**
 * Find the first image in the content.
 */
function findFirstImageInContent(
  $body: cheerio.CheerioAPI,
  baseUrl: string,
): { url: string; element: cheerio.Cheerio<Element> } | null {
  const firstImg = $body("img").first();
  if (firstImg.length > 0) {
    const imgSrc =
      firstImg.attr("src") ||
      firstImg.attr("data-src") ||
      firstImg.attr("data-lazy-src");
    if (imgSrc) {
      try {
        return { url: new URL(imgSrc, baseUrl).toString(), element: firstImg };
      } catch {
        /* skip */
      }
    }
  }
  return null;
}

/**
 * Find the first valid link in the content.
 */
function findFirstLinkInContent(
  $body: cheerio.CheerioAPI,
  baseUrl: string,
): { url: string; element: cheerio.Cheerio<Element> } | null {
  const firstLink = $body("a[href]").first();
  if (firstLink.length > 0) {
    const linkHref = firstLink.attr("href");
    if (
      linkHref &&
      !linkHref.includes("${") &&
      !linkHref.startsWith("data:") &&
      linkHref.trim() !== ""
    ) {
      try {
        const url = new URL(linkHref, baseUrl).toString();
        if (
          url.startsWith("http") &&
          !url.includes("${") &&
          !url.includes("%7B")
        ) {
          return { url, element: firstLink };
        }
      } catch {
        /* skip */
      }
    }
  }
  return null;
}

/**
 * Find the first URL (image or link) in the content to use for a header image.
 */
function findFirstUrlInContent(
  $body: cheerio.CheerioAPI,
  baseUrl: string,
): { url: string; element: cheerio.Cheerio<Element> } | null {
  return (
    findFirstImageInContent($body, baseUrl) ||
    findFirstLinkInContent($body, baseUrl)
  );
}

/**
 * Normalize URL for comparison.
 */
const normalizeUrlForComparison = (url: string) =>
  url.replace(/\/$/, "").split("#")[0].split("?")[0];

/**
 * Remove empty parent containers recursively.
 */
function removeEmptyParents(element: cheerio.Cheerio<Element>): void {
  let currentParent = element.parent();
  while (currentParent.length > 0) {
    const tagName = currentParent.get(0)?.tagName?.toLowerCase();
    if (tagName === "body" || tagName === "html") {
      break;
    }
    const text = currentParent.text().trim();
    const hasChildren = currentParent.children().length > 0;
    if (!text && !hasChildren) {
      const nextParent = currentParent.parent();
      currentParent.remove();
      currentParent = nextParent;
    } else {
      break;
    }
  }
}

/**
 * Remove duplicate YouTube elements.
 */
function removeYouTubeDuplicates(
  $body: cheerio.CheerioAPI,
  videoId: string,
  baseUrl: string,
): void {
  $body("a[href]").each((_, el) => {
    const href = $body(el).attr("href");
    if (href) {
      try {
        if (
          extractYouTubeVideoId(new URL(href, baseUrl).toString()) === videoId
        ) {
          const $link = $body(el);
          const $parent = $link.parent();
          $link.remove();
          removeEmptyParents($parent);
        }
      } catch {
        /* ignore */
      }
    }
  });

  // Remove first image if using YouTube video
  const firstImg = $body("img").first();
  if (firstImg.length > 0) {
    const $parent = firstImg.parent();
    firstImg.remove();
    removeEmptyParents($parent);
  }
}

/**
 * Remove duplicate Reddit elements.
 */
function removeRedditDuplicates(
  $body: cheerio.CheerioAPI,
  basePostUrl: string,
  baseUrl: string,
): void {
  $body("a[href]").each((_, el) => {
    const $link = $body(el);
    const href = $link.attr("href");
    const linkText = $link.text().toLowerCase().trim();
    if (href) {
      try {
        const resolvedHref = new URL(href, baseUrl).toString();
        const matchesPostUrl =
          normalizeUrlForComparison(resolvedHref) ===
          normalizeUrlForComparison(basePostUrl);
        const isVideoLink =
          linkText.includes("view video") || linkText.includes("▶");
        if (
          resolvedHref.includes("v.redd.it") ||
          (matchesPostUrl && isVideoLink)
        ) {
          const $parent = $link.parent();
          $link.remove();
          removeEmptyParents($parent);
        }
      } catch {
        /* ignore */
      }
    }
  });

  $body("img").each((_, el) => {
    const $img = $body(el);
    const imgSrc =
      $img.attr("src") || $img.attr("data-src") || $img.attr("data-lazy-src");
    if (imgSrc) {
      try {
        const resolvedImgSrc = new URL(imgSrc, baseUrl).toString();
        const isRedditImg =
          resolvedImgSrc.includes("preview.redd.it") ||
          resolvedImgSrc.includes("i.redd.it") ||
          resolvedImgSrc.includes("external-preview.redd.it");
        if (isRedditImg) {
          const altText = ($img.attr("alt") || "").toLowerCase();
          const parentText = $img.parent().text().toLowerCase();
          const isVideoThumbnail =
            altText.includes("video") ||
            altText.includes("thumbnail") ||
            parentText.includes("view video") ||
            parentText.includes("▶");
          if (isVideoThumbnail) {
            const $parent = $img.parent();
            $img.remove();
            removeEmptyParents($parent);
          }
        }
      } catch {
        /* ignore */
      }
    }
  });
}

/**
 * Remove duplicate elements from body.
 */
function removeDuplicates(
  $body: cheerio.CheerioAPI,
  videoId: string | null,
  isRedditEmbed: boolean,
  basePostUrl: string,
  firstElement: cheerio.Cheerio<Element> | null,
  baseUrl: string,
): void {
  if (videoId) {
    removeYouTubeDuplicates($body, videoId, baseUrl);
  }

  if (isRedditEmbed) {
    removeRedditDuplicates($body, basePostUrl, baseUrl);
  }

  // Remove original first element
  if (firstElement && firstElement.length > 0) {
    const $parent = firstElement.parent();
    firstElement.remove();
    removeEmptyParents($parent);
  }
}

/**
 * Create header element from data URI.
 */
async function createHeaderFromDataUri(
  firstUrl: string,
): Promise<string | null> {
  if (!firstUrl.includes(";base64,")) return null;

  const [header, encoded] = firstUrl.split(";base64,", 2);
  const contentType = header.split(":")[1] || "image/jpeg";
  if (!contentType.startsWith("image/")) return null;

  try {
    const imageData = Buffer.from(encoded, "base64");
    await sharp(imageData).metadata();
    const compressed = await compressImage(
      imageData,
      contentType,
      MAX_HEADER_IMAGE_WIDTH,
      MAX_HEADER_IMAGE_HEIGHT,
    );
    const dataUri = `data:${compressed.contentType};base64,${compressed.imageData.toString("base64")}`;
    return `<header><p><img src="${dataUri}" alt="Article image" style="max-width: 100%; height: auto;"></p></header>`;
  } catch {
    return null;
  }
}

/**
 * Create header element from URL or data URI.
 */
async function createHeaderPart(
  firstUrl: string,
  contentParts: string[],
  article: RawArticle,
  $body: cheerio.CheerioAPI,
  baseUrl: string,
  firstElement: cheerio.Cheerio<Element> | null,
  isUsingHeaderImageUrl: boolean,
): Promise<void> {
  if (firstUrl.startsWith("data:")) {
    const headerHtml = await createHeaderFromDataUri(firstUrl);
    if (headerHtml) contentParts.push(headerHtml);
    return;
  }

  try {
    const headerElement = await createHeaderElementFromUrl(
      firstUrl,
      "Article image",
    );
    if (!headerElement) return;

    const cleaned = headerElement
      .replace(/<div[^>]*data-article-header[^>]*>/gi, "")
      .replace(/<\/div>/gi, "");
    const wrappedHeader =
      headerElement.includes("<header>") || headerElement.includes("<header ")
        ? headerElement
        : `<header>${cleaned}</header>`;
    contentParts.push(wrappedHeader);
    article.thumbnailUrl = firstUrl;

    if (isUsingHeaderImageUrl || (firstElement && firstElement.length > 0)) {
      const videoId = extractYouTubeVideoId(firstUrl);
      const isRedditEmbed =
        firstUrl.includes("vxreddit.com") ||
        (firstUrl.includes("/embed") &&
          (firstUrl.includes("reddit.com") || firstUrl.includes("v.redd.it")));
      let basePostUrl = firstUrl;
      if (firstUrl.includes("vxreddit.com")) {
        basePostUrl = firstUrl.replace("vxreddit.com", "reddit.com");
      } else if (firstUrl.includes("/embed")) {
        basePostUrl = firstUrl
          .replace(/\/embed$/, "")
          .replace(/\/embed\//, "/");
      }
      removeDuplicates(
        $body,
        videoId,
        isRedditEmbed,
        basePostUrl,
        firstElement,
        baseUrl,
      );
    }
  } catch (error) {
    if (error instanceof ArticleSkipError) throw error;
    logger.warn({ error, url: firstUrl }, "Failed to create header element");
  }
}

/**
 * Build the final article structure.
 */
function buildArticleStructure(
  existingHeaders: string[],
  contentParts: string[],
  bodyHtml: string,
  commentSections: string[],
  addSourceFooter: boolean,
  hasExistingFooter: boolean,
  articleUrl: string,
): string {
  const existingHeaderHtml = existingHeaders.join("");
  const newHeaderHtml =
    contentParts.find((part) => part.includes("<header>")) || "";
  const headerHtml = existingHeaderHtml || newHeaderHtml;

  const mainContentSection = bodyHtml.trim()
    ? `<section>${bodyHtml}</section>`
    : "";
  const commentSectionsHtml = commentSections.join("");

  let footerHtml = "";
  if (addSourceFooter && !hasExistingFooter) {
    footerHtml = `<footer style="margin-bottom: 16px;"><a href="${articleUrl}" style="float: right;">Source</a></footer>`;
  }

  return `<article>${headerHtml}${mainContentSection}${commentSectionsHtml}${footerHtml}</article>`;
}

/**
 * Extract body content from HTML.
 */
function extractBodyContent($: cheerio.CheerioAPI): string {
  const hasArticleWrapper = $("article").length > 0;
  if (hasArticleWrapper) {
    return $("article").html() || "";
  }
  const body = $("body");
  return body.length > 0 ? body.html() || "" : $.html();
}

/**
 * Find the first URL and element for the header image.
 */
function findFirstHeaderImageUrl(
  $body: cheerio.CheerioAPI,
  headerImageUrl: string | undefined,
  finalBaseUrl: string,
  articleUrl: string,
): {
  firstUrl: string;
  firstElement: cheerio.Cheerio<Element> | null;
  isUsingHeaderImageUrl: boolean;
} {
  if (headerImageUrl) {
    const firstUrl = new URL(headerImageUrl, finalBaseUrl).toString();
    const normalizedHeaderUrl = normalizeUrlForComparison(firstUrl);
    let firstElement: cheerio.Cheerio<Element> | null = null;

    $body("img").each((_, el) => {
      if (firstElement) return;
      const imgSrc =
        $body(el).attr("src") ||
        $body(el).attr("data-src") ||
        $body(el).attr("data-lazy-src");
      if (imgSrc) {
        try {
          if (
            normalizeUrlForComparison(
              new URL(imgSrc, finalBaseUrl).toString(),
            ) === normalizedHeaderUrl
          ) {
            firstElement = $body(el);
          }
        } catch {
          /* ignore */
        }
      }
    });
    return { firstUrl, firstElement, isUsingHeaderImageUrl: true };
  }

  const found = findFirstUrlInContent($body, finalBaseUrl);
  return {
    firstUrl: found?.url || articleUrl,
    firstElement: found?.element || null,
    isUsingHeaderImageUrl: false,
  };
}

/**
 * Extract comment sections from body.
 */
function extractCommentSections($body: cheerio.CheerioAPI): string[] {
  const commentSections: string[] = [];
  $body("section").each((_, el) => {
    const $section = $body(el);
    const sectionText = $section.text().toLowerCase();
    const sectionHtml = $section.html() || "";
    if (
      sectionText.includes("comment") ||
      /<h[1-6][^>]*>.*comment/i.exec(sectionHtml)
    ) {
      commentSections.push($section.toString());
    }
  });
  return commentSections;
}

/**
 * Standardize content format across all feeds.
 */
export async function standardizeContentFormat(
  content: string,
  article: RawArticle,
  baseUrl?: string,
  generateTitleImage: boolean = true,
  addSourceFooter: boolean = true,
  headerImageUrl?: string,
): Promise<string> {
  const finalBaseUrl = baseUrl || article.url;
  logger.debug(
    { url: article.url, generateTitleImage },
    "Standardizing content format",
  );

  try {
    const $ = cheerio.load(content);
    const bodyContent = extractBodyContent($);
    const $body = cheerio.load(bodyContent);
    const hasExistingHeader = $body("header").length > 0;
    const contentParts: string[] = [];

    if (generateTitleImage && !hasExistingHeader) {
      const { firstUrl, firstElement, isUsingHeaderImageUrl } =
        findFirstHeaderImageUrl(
          $body,
          headerImageUrl,
          finalBaseUrl,
          article.url,
        );
      if (
        firstUrl &&
        !firstUrl.includes("${") &&
        !firstUrl.includes("%7B") &&
        !firstUrl.includes("%24%7B")
      ) {
        await createHeaderPart(
          firstUrl,
          contentParts,
          article,
          $body,
          finalBaseUrl,
          firstElement,
          isUsingHeaderImageUrl,
        );
      }
    }

    const hasExistingFooter = $body("footer").length > 0;
    const existingHeaders: string[] = [];
    $body("header").each((_index, el) => {
      existingHeaders.push($body(el).toString());
    });

    const commentSections = extractCommentSections($body);

    $body("header, footer, section").remove();
    return buildArticleStructure(
      existingHeaders,
      contentParts,
      $body.html() || "",
      commentSections,
      addSourceFooter,
      hasExistingFooter,
      article.url,
    );
  } catch (error) {
    if (error instanceof ArticleSkipError) throw error;
    logger.error({ error }, "Error standardizing content format");
    const hasArticle = content.includes("<article");
    if (hasArticle) return content;
    const footer = addSourceFooter
      ? `<footer style="margin-bottom: 16px;"><a href="${article.url}" style="float: right;">Source</a></footer>`
      : "";
    return `<article>${content}${footer}</article>`;
  }
}

/**
 * Process and sanitize HTML content.
 */
export async function processContent(
  html: string,
  article: RawArticle,
  generateTitleImage: boolean = true,
  addSourceFooter: boolean = true,
  headerImageUrl?: string,
): Promise<string> {
  // Standardize format (add header image, source link)
  return await standardizeContentFormat(
    html,
    article,
    article.url,
    generateTitleImage,
    addSourceFooter,
    headerImageUrl,
  );
}
