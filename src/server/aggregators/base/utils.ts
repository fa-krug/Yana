/**
 * Utility functions for aggregators.
 *
 * This file re-exports utilities from submodules and contains core utilities.
 */

// Re-export all utilities from submodules
export * from "./utils/index";

// Core utilities (article filtering)
import { logger } from "@server/utils/logger";

/**
 * Check if article should be skipped.
 */
export function shouldSkipArticle(
  title: string,
  skipDuplicates: boolean,
  existingTitles: Set<string>,
): boolean {
  if (!skipDuplicates) return false;

  const normalizedTitle = title.toLowerCase().trim();
  return existingTitles.has(normalizedTitle);
}

/**
 * Check if an article should be skipped during aggregation.
 *
 * Consolidates common skip logic:
 * 1. Skip if URL already exists in this feed (unless forceRefresh)
 * 2. Skip if article with same name exists in last 2 weeks in this feed (unless forceRefresh)
 *
 * @param article - The article to check
 * @param forceRefresh - If true, don't skip existing articles
 * @returns Object with shouldSkip boolean and optional reason string
 */
export async function shouldSkipArticleByDuplicate(
  article: { url: string; title: string },
  feedId: number,
  forceRefresh: boolean,
): Promise<{ shouldSkip: boolean; reason: string | null }> {
  // Import here to avoid circular dependency
  const { db, articles } = await import("../../db");
  const { eq, and, gte } = await import("drizzle-orm");

  // If forcing refresh, don't skip
  if (forceRefresh) {
    return { shouldSkip: false, reason: null };
  }

  // Check 1: URL already exists in this feed
  const [existingByUrl] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.url, article.url), eq(articles.feedId, feedId)))
    .limit(1);

  if (existingByUrl) {
    return { shouldSkip: true, reason: null }; // Don't log for existing articles (too verbose)
  }

  // Check 2: Article with same name exists in last 2 weeks (only in this feed)
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const [existingByName] = await db
    .select()
    .from(articles)
    .where(
      and(
        eq(articles.name, article.title),
        eq(articles.feedId, feedId),
        gte(articles.date, twoWeeksAgo),
      ),
    )
    .limit(1);

  if (existingByName) {
    return {
      shouldSkip: true,
      reason: `Article with same name exists in last 2 weeks: ${article.title}`,
    };
  }

  // Don't skip
  return { shouldSkip: false, reason: null };
}
