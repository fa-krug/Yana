/**
 * Mein-MMO fetching utilities - handles multi-page article fetching.
 */

import * as cheerio from "cheerio";
import type pino from "pino";
import { ContentFetchError } from "../base/exceptions";
import { fetchArticleContent as baseFetchArticleContent } from "../base/fetch";

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
  logger.info(
    {
      step: "enrichArticles",
      subStep: "fetchAllPages",
      aggregator: aggregatorId,
      feedId,
      url: baseUrl,
    },
    "Fetching all pages of multi-page article",
  );

  // Fetch first page to get pagination info
  const firstPageHtml = await baseFetch(baseUrl);
  const pageNumbers = extractPageNumbers(
    firstPageHtml,
    logger,
    aggregatorId,
    feedId,
  );

  if (pageNumbers.size <= 1) {
    // Single page article, return first page content
    logger.debug(
      {
        step: "enrichArticles",
        subStep: "fetchAllPages",
        aggregator: aggregatorId,
        feedId,
        url: baseUrl,
      },
      "Single page article, returning first page",
    );
    const $ = cheerio.load(firstPageHtml);
    const content = $("div.gp-entry-content").first();
    return content.html() || "";
  }

  const sortedPages = Array.from(pageNumbers).sort((a, b) => a - b);
  const maxPage = sortedPages[sortedPages.length - 1];
  logger.info(
    {
      step: "enrichArticles",
      subStep: "fetchAllPages",
      aggregator: aggregatorId,
      feedId,
      url: baseUrl,
      pageCount: pageNumbers.size,
      maxPage,
    },
    "Found multiple pages, fetching all",
  );

  const allContentParts: string[] = [];

  // Fetch all pages
  for (const pageNum of sortedPages) {
    try {
      let pageUrl: string;
      if (pageNum === 1) {
        pageUrl = baseUrl;
      } else {
        // Append page number to URL
        // Handle URLs ending with / or not
        pageUrl = baseUrl.endsWith("/")
          ? `${baseUrl}${pageNum}/`
          : `${baseUrl}/${pageNum}/`;
      }

      logger.debug(
        {
          step: "enrichArticles",
          subStep: "fetchAllPages",
          aggregator: aggregatorId,
          feedId,
          pageNum,
          maxPage,
          url: pageUrl,
        },
        "Fetching page",
      );

      const pageHtml = await baseFetch(pageUrl);
      const $ = cheerio.load(pageHtml);
      const content = $("div.gp-entry-content").first();

      if (content.length > 0) {
        allContentParts.push(content.html() || "");
        logger.debug(
          {
            step: "enrichArticles",
            subStep: "fetchAllPages",
            aggregator: aggregatorId,
            feedId,
            pageNum,
            maxPage,
          },
          "Page fetched successfully",
        );
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
      if (error instanceof ContentFetchError) {
        logger.warn(
          {
            step: "enrichArticles",
            subStep: "fetchAllPages",
            aggregator: aggregatorId,
            feedId,
            error: error instanceof Error ? error : new Error(String(error)),
            pageNum,
            maxPage,
          },
          "Failed to fetch page",
        );
      } else {
        logger.error(
          {
            step: "enrichArticles",
            subStep: "fetchAllPages",
            aggregator: aggregatorId,
            feedId,
            error: error instanceof Error ? error : new Error(String(error)),
            pageNum,
            maxPage,
          },
          "Unexpected error fetching page",
        );
      }
      // Continue with other pages even if one fails
    }
  }

  // Combine all content
  const combinedContent = allContentParts.join("\n\n");
  logger.info(
    {
      step: "enrichArticles",
      subStep: "fetchAllPages",
      aggregator: aggregatorId,
      feedId,
      url: baseUrl,
      pageCount: allContentParts.length,
      contentLength: combinedContent.length,
    },
    "Combined pages",
  );

  return combinedContent;
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
  let pagination = $("nav.navigation.pagination").first();
  if (pagination.length === 0) {
    // Fallback: look for ul.page-numbers
    pagination = $("ul.page-numbers").first();
  }
  if (pagination.length === 0) {
    // Fallback: search in entire document
    pagination = $("body");
  }

  // Look for page number links
  pagination.find("a.page-numbers, a.post-page-numbers").each((_, el) => {
    const $link = $(el);
    // Try to get page number from link text
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
        },
        "Found page number from link text",
      );
    }

    // Also try to extract from URL
    const href = $link.attr("href") || "";
    if (href) {
      // Try pattern: /article-name/2/ or /article-name/2
      const match = href.match(/\/(\d+)\/?$/);
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
          },
          "Found page number from URL",
        );
      }
    }
  });

  // Also check for span.page-numbers (current page indicator)
  pagination.find("span.page-numbers, span.current").each((_, el) => {
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
        },
        "Found current page number from span",
      );
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
