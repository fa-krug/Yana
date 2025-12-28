/**
 * Mein-MMO fetching utilities - handles multi-page article fetching.
 */

import * as cheerio from "cheerio";
import type pino from "pino";

import { ContentFetchError } from "../base/exceptions";

/**
 * Fetch a single page and extract its content.
 */
async function fetchPageContent(
  url: string,
  baseFetch: (url: string) => Promise<string>,
): Promise<string | null> {
  const pageHtml = await baseFetch(url);
  const $ = cheerio.load(pageHtml);
  const content = $("div.gp-entry-content").first();
  return content.length > 0 ? content.html() : null;
}

/**
 * Log page fetch error based on type.
 */
function logPageFetchError(
  error: unknown,
  pageNum: number,
  maxPage: number,
  logger: pino.Logger,
  aggregatorId: string,
  feedId: number | null | undefined,
): void {
  const logCtx = {
    step: "enrichArticles",
    subStep: "fetchAllPages",
    aggregator: aggregatorId,
    feedId,
    pageNum,
    maxPage,
  };
  if (error instanceof ContentFetchError) {
    logger.warn({ ...logCtx, error }, "Failed to fetch page");
  } else {
    logger.error(
      {
        ...logCtx,
        error: error instanceof Error ? error : new Error(String(error)),
      },
      "Unexpected error fetching page",
    );
  }
}

/**
 * Fetch all pages of a multi-page article and combine the content.
 */
export async function fetchAllPages(
  baseUrl: string,
  logger: pino.Logger,
  aggregatorId: string,
  feedId: number | null | undefined,
  baseFetch: (url: string) => Promise<string>,
): Promise<string> {
  const firstPageHtml = await baseFetch(baseUrl);
  const pageNumbers = extractPageNumbers(
    firstPageHtml,
    logger,
    aggregatorId,
    feedId,
  );

  if (pageNumbers.size <= 1) {
    const $ = cheerio.load(firstPageHtml);
    return $("div.gp-entry-content").first().html() || "";
  }

  const sortedPages = Array.from(pageNumbers).sort((a, b) => a - b);
  const maxPage = sortedPages[sortedPages.length - 1];
  const allContentParts: string[] = [];

  for (const pageNum of sortedPages) {
    try {
      let pageUrl: string;
      if (pageNum === 1) {
        pageUrl = baseUrl;
      } else {
        pageUrl = baseUrl.endsWith("/")
          ? `${baseUrl}${pageNum}/`
          : `${baseUrl}/${pageNum}/`;
      }
      const content = await fetchPageContent(pageUrl, baseFetch);
      if (content) {
        allContentParts.push(content);
      } else {
        logger.warn(
          {
            step: "enrichArticles",
            subStep: "fetchAllPages",
            aggregator: aggregatorId,
            feedId,
            pageNum,
            maxPage,
          },
          "Could not find content div on page",
        );
      }
    } catch (error) {
      logPageFetchError(error, pageNum, maxPage, logger, aggregatorId, feedId);
    }
  }

  return allContentParts.join("\n\n");
}

/**
 * Extract all page numbers from pagination in the HTML.
 */
export function extractPageNumbers(
  html: string,
  logger: pino.Logger,
  aggregatorId: string,
  feedId: number | null | undefined,
): Set<number> {
  const $ = cheerio.load(html);
  const pageNumbers = new Set<number>([1]); // Always include page 1

  // Look for pagination container (WordPress standard)
  // Try multiple selectors to find pagination container
  let pagination = $("nav.navigation.pagination").first();
  if (pagination.length === 0) {
    // Try div.gp-pagination (Mein-MMO specific)
    // There may be multiple pagination divs, so find the one with page numbers
    const paginationWithNumbers = $("div.gp-pagination").filter((_, el) => {
      return $(el).find("ul.page-numbers").length > 0;
    });
    if (paginationWithNumbers.length > 0) {
      pagination = paginationWithNumbers.first();
    } else {
      // Fallback to first div.gp-pagination if none have page numbers
      pagination = $("div.gp-pagination").first();
    }
  }
  if (pagination.length === 0) {
    // Fallback: look for ul.page-numbers
    pagination = $("ul.page-numbers").first();
  }
  if (pagination.length === 0) {
    // Fallback: search in entire document
    pagination = $("body");
  }

  logger.debug(
    {
      step: "enrichArticles",
      subStep: "fetchAllPages",
      aggregator: aggregatorId,
      feedId,
      paginationContainer:
        pagination.length > 0 ? pagination.get(0)?.tagName : "none",
    },
    "Found pagination container",
  );

  // Look for page number links
  pagination.find("a.page-numbers, a.post-page-numbers").each((_, el) => {
    const $link = $(el);
    // Try to get page number from link text (handles nested spans)
    const text = $link.text().trim();
    if (/^\d+$/.test(text)) {
      pageNumbers.add(parseInt(text, 10));
      logger.debug(
        {
          step: "enrichArticles",
          subStep: "fetchAllPages",
          aggregator: aggregatorId,
          feedId,
          pageNumber: text,
          source: "link_text",
        },
        "Found page number from link text",
      );
    }

    // Also try to extract from nested span.page-numbers
    const nestedSpan = $link.find("span.page-numbers").first();
    if (nestedSpan.length > 0) {
      const spanText = nestedSpan.text().trim();
      if (/^\d+$/.test(spanText)) {
        pageNumbers.add(parseInt(spanText, 10));
        logger.debug(
          {
            step: "enrichArticles",
            subStep: "fetchAllPages",
            aggregator: aggregatorId,
            feedId,
            pageNumber: spanText,
            source: "nested_span",
          },
          "Found page number from nested span",
        );
      }
    }

    // Also try to extract from URL
    const href = $link.attr("href") || "";
    if (href) {
      // Try pattern: /article-name/2/ or /article-name/2
      const match = /\/(\d+)\/?$/.exec(href);
      if (match) {
        pageNumbers.add(parseInt(match[1], 10));
        logger.debug(
          {
            step: "enrichArticles",
            subStep: "fetchAllPages",
            aggregator: aggregatorId,
            feedId,
            pageNumber: match[1],
            href,
            source: "url",
          },
          "Found page number from URL",
        );
      }
    }
  });

  // Also check for span.page-numbers and span.post-page-numbers (current page indicator)
  // This handles both nested and direct span elements
  pagination
    .find("span.page-numbers, span.post-page-numbers, span.current")
    .each((_, el) => {
      const $span = $(el);
      const text = $span.text().trim();
      if (/^\d+$/.test(text)) {
        pageNumbers.add(parseInt(text, 10));
        logger.debug(
          {
            step: "enrichArticles",
            subStep: "fetchAllPages",
            aggregator: aggregatorId,
            feedId,
            pageNumber: text,
            source: "span",
          },
          "Found current page number from span",
        );
      }
      // Also check nested span.page-numbers within span.post-page-numbers
      const nestedSpan = $span.find("span.page-numbers").first();
      if (nestedSpan.length > 0) {
        const nestedText = nestedSpan.text().trim();
        if (/^\d+$/.test(nestedText)) {
          pageNumbers.add(parseInt(nestedText, 10));
          logger.debug(
            {
              step: "enrichArticles",
              subStep: "fetchAllPages",
              aggregator: aggregatorId,
              feedId,
              pageNumber: nestedText,
              source: "nested_span_in_span",
            },
            "Found page number from nested span in span",
          );
        }
      }
    });

  logger.info(
    {
      step: "enrichArticles",
      subStep: "fetchAllPages",
      aggregator: aggregatorId,
      feedId,
      pageNumbers: Array.from(pageNumbers).sort((a, b) => a - b),
    },
    "Extracted page numbers",
  );
  return pageNumbers;
}
