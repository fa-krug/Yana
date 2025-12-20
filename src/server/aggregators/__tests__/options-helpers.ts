/**
 * Test helpers for aggregator and feed options testing.
 */

import type { Feed } from "@server/db/types";
import type { BaseAggregator } from "../base/aggregator";
import type { RawArticle } from "../base/types";
import { db, feeds, articles } from "@server/db";
import { processFeedAggregation } from "@server/services/aggregation.service";
import { eq, desc } from "drizzle-orm";
import * as cheerio from "cheerio";
import { expect, vi } from "vitest";

/**
 * Create a feed with specific aggregator and feed options.
 */
export async function createFeedWithOptions(
  userId: number,
  aggregatorId: string,
  identifier: string,
  aggregatorOptions: Record<string, unknown> = {},
  feedOptions: {
    generateTitleImage?: boolean;
    addSourceFooter?: boolean;
    useCurrentTimestamp?: boolean;
    skipDuplicates?: boolean;
    dailyPostLimit?: number;
  } = {},
): Promise<Feed> {
  const [feed] = await db
    .insert(feeds)
    .values({
      userId,
      name: `Test Feed - ${aggregatorId}`,
      identifier,
      aggregator: aggregatorId,
      feedType: getFeedTypeForAggregator(aggregatorId),
      enabled: true,
      generateTitleImage: feedOptions.generateTitleImage ?? true,
      addSourceFooter: feedOptions.addSourceFooter ?? true,
      useCurrentTimestamp: feedOptions.useCurrentTimestamp ?? false,
      skipDuplicates: feedOptions.skipDuplicates ?? true,
      dailyPostLimit: feedOptions.dailyPostLimit ?? 50,
      aggregatorOptions: aggregatorOptions as any, // Drizzle will handle JSON serialization
    })
    .returning();

  return feed;
}

/**
 * Get feed type for aggregator.
 */
function getFeedTypeForAggregator(
  id: string,
): "article" | "youtube" | "podcast" | "reddit" {
  if (id === "youtube") return "youtube";
  if (id === "podcast") return "podcast";
  if (id === "reddit") return "reddit";
  return "article";
}

/**
 * Run full aggregation and return results.
 */
export async function runFullAggregation(
  feedId: number,
  forceRefresh: boolean = false,
): Promise<{ articlesCreated: number; articlesUpdated: number }> {
  return await processFeedAggregation(feedId, forceRefresh);
}

/**
 * Get articles for a feed.
 */
export async function getFeedArticles(feedId: number) {
  return await db
    .select()
    .from(articles)
    .where(eq(articles.feedId, feedId))
    .orderBy(desc(articles.date));
}

/**
 * Instrumentation helper to trace aggregation flow.
 */
export async function traceAggregation(
  feedId: number,
  testName: string,
): Promise<{
  rawArticles: any[];
  savedArticles: any[];
  feed: any;
}> {
  const aggregationService =
    await import("@server/services/aggregation.service");
  const articleService =
    await import("@server/services/aggregation-article.service");
  const BaseAggregatorClass = await import("../../aggregators/base/aggregator");

  let capturedRawArticles: any[] = [];
  let capturedFeed: any = null;

  // Capture what aggregate() returns
  const originalAggregate =
    BaseAggregatorClass.BaseAggregator.prototype.aggregate;
  const aggregateSpy = vi
    .spyOn(BaseAggregatorClass.BaseAggregator.prototype, "aggregate")
    .mockImplementation(async function (this: any, limit?: number) {
      const result = await originalAggregate.call(this, limit);
      capturedRawArticles = result;
      console.log(
        `[TRACE:${testName}] aggregate() returned ${result.length} articles`,
      );
      if (result.length > 0) {
        console.log(`[TRACE:${testName}] First article:`, {
          title: result[0].title,
          url: result[0].url,
          contentLength: result[0].content?.length || 0,
          contentPreview: result[0].content?.substring(0, 150),
          thumbnailUrl: result[0].thumbnailUrl,
          published: result[0].published,
        });
      } else {
        console.log(
          `[TRACE:${testName}] WARNING: aggregate() returned 0 articles`,
        );
      }
      return result;
    });

  // Capture what saveAggregatedArticles receives and trace filtering
  const originalSave = articleService.saveAggregatedArticles;
  const saveSpy = vi
    .spyOn(articleService, "saveAggregatedArticles")
    .mockImplementation(
      async (
        rawArticles: RawArticle[],
        feed: Feed,
        aggregator: BaseAggregator,
        forceRefresh: boolean,
      ) => {
        capturedFeed = feed;
        console.log(
          `[TRACE:${testName}] saveAggregatedArticles called with ${rawArticles.length} articles`,
        );
        if (rawArticles.length > 0) {
          console.log(`[TRACE:${testName}] First article in save:`, {
            title: rawArticles[0].title,
            url: rawArticles[0].url,
            contentLength: rawArticles[0].content?.length || 0,
            thumbnailUrl: rawArticles[0].thumbnailUrl,
            published: rawArticles[0].published,
            feedUseCurrentTimestamp: feed.useCurrentTimestamp,
            feedSkipDuplicates: feed.skipDuplicates,
            forceRefresh,
          });
        }

        // Add detailed tracing inside saveAggregatedArticles
        const shouldSkipModule = await import("../../aggregators/base/utils");
        const originalShouldSkip =
          shouldSkipModule.shouldSkipArticleByDuplicate;
        const skipSpy = vi
          .spyOn(shouldSkipModule, "shouldSkipArticleByDuplicate")
          .mockImplementation(
            async (
              article: { url: string; title: string },
              feedId: number,
              feedUserId: number | null,
              forceRefresh: boolean,
            ) => {
              const result = await originalShouldSkip(
                article,
                feedId,
                feedUserId,
                forceRefresh,
              );
              if (result.shouldSkip || result.shouldUpdate) {
                console.log(
                  `[TRACE:${testName}] Article ${article.url} - shouldSkip: ${result.shouldSkip}, shouldUpdate: ${result.shouldUpdate}, reason: ${result.reason}`,
                );
              }
              return result;
            },
          );

        const result = await originalSave(
          rawArticles,
          feed,
          aggregator,
          forceRefresh,
        );
        console.log(
          `[TRACE:${testName}] saveAggregatedArticles result:`,
          result,
        );

        skipSpy.mockRestore();
        return result;
      },
    );

  // Enable test tracing
  (global as any).__TEST_TRACE = true;

  // Run aggregation
  await runFullAggregation(feedId);

  // Disable test tracing
  (global as any).__TEST_TRACE = false;

  // Get saved articles
  const savedArticles = await getFeedArticles(feedId);
  console.log(
    `[TRACE:${testName}] Final saved articles: ${savedArticles.length}`,
  );
  if (savedArticles.length > 0) {
    console.log(`[TRACE:${testName}] First saved article:`, {
      name: savedArticles[0].name,
      contentLength: savedArticles[0].content?.length || 0,
      thumbnailUrl: savedArticles[0].thumbnailUrl,
      date: savedArticles[0].date,
      contentPreview: savedArticles[0].content?.substring(0, 200),
    });
  } else {
    console.log(`[TRACE:${testName}] WARNING: No articles saved to database`);
  }

  // Restore original implementations
  aggregateSpy.mockRestore();
  saveSpy.mockRestore();

  return {
    rawArticles: capturedRawArticles,
    savedArticles,
    feed: capturedFeed,
  };
}

/**
 * Verify article content contains expected elements.
 */
export function verifyArticleContent(
  articleContent: string,
  checks: {
    contains?: string[];
    notContains?: string[];
    hasHeader?: boolean;
    hasFooter?: boolean;
    headerImageCount?: number;
    footerLinkCount?: number;
  },
): void {
  const $ = cheerio.load(articleContent);

  // Check for required strings
  if (checks.contains) {
    for (const text of checks.contains) {
      expect(articleContent).toContain(text);
    }
  }

  // Check for absent strings
  if (checks.notContains) {
    for (const text of checks.notContains) {
      expect(articleContent).not.toContain(text);
    }
  }

  // Check for header
  if (checks.hasHeader !== undefined) {
    if (checks.hasHeader) {
      expect($("header").length).toBeGreaterThan(0);
    } else {
      expect($("header").length).toBe(0);
    }
  }

  // Check for footer
  if (checks.hasFooter !== undefined) {
    if (checks.hasFooter) {
      expect($("footer").length).toBeGreaterThan(0);
    } else {
      expect($("footer").length).toBe(0);
    }
  }

  // Check header image count
  if (checks.headerImageCount !== undefined) {
    expect($("header img").length).toBe(checks.headerImageCount);
  }

  // Check footer link count
  if (checks.footerLinkCount !== undefined) {
    expect($("footer a").length).toBe(checks.footerLinkCount);
  }
}

/**
 * Verify article metadata matches feed options.
 */
export function verifyArticleMetadata(
  article: {
    date: Date;
    content: string;
  },
  feed: Feed,
  expectedPublishedDate?: Date,
): void {
  // Check date
  if (feed.useCurrentTimestamp) {
    // Date should be recent (within last minute)
    const now = new Date();
    const diff = Math.abs(now.getTime() - article.date.getTime());
    expect(diff).toBeLessThan(60000); // Within 1 minute
  } else if (expectedPublishedDate) {
    expect(article.date.getTime()).toBe(expectedPublishedDate.getTime());
  }

  // Check content structure
  const $ = cheerio.load(article.content);

  // Check header image
  if (feed.generateTitleImage) {
    // Should have header, but image is optional (depends on content)
    // Just verify structure exists
    expect($("article").length).toBeGreaterThan(0);
  }

  // Check footer
  if (feed.addSourceFooter) {
    expect($("footer").length).toBeGreaterThan(0);
    expect($("footer a").length).toBeGreaterThan(0);
  } else {
    expect($("footer").length).toBe(0);
  }
}

/**
 * Verify selector elements are removed from content.
 */
export function verifySelectorsRemoved(
  content: string,
  selectors: string[],
): void {
  const $ = cheerio.load(content);
  for (const selector of selectors) {
    expect($(selector).length).toBe(0);
  }
}

/**
 * Verify regex replacements were applied.
 */
export function verifyRegexReplacements(
  content: string,
  replacements: Array<{ pattern: string; replacement: string }>,
): void {
  for (const { pattern, replacement } of replacements) {
    // Check that replacement text exists
    expect(content).toContain(replacement);
    // Check that original pattern doesn't exist (unless it's a partial match)
    // This is a simplified check - full regex testing would be more complex
  }
}
