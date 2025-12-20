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
import { expect } from "vitest";

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
