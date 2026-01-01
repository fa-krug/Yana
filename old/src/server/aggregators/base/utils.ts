/**
 * Utility functions for aggregators.
 *
 * This file re-exports utilities from submodules and contains core utilities.
 */

// Re-export all utilities from submodules
export * from "./utils/index";

// Core utilities (article filtering)
import type { Article } from "@server/db/types";

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
 * 1. Skip if URL already exists in this feed AND article is read (unless forceRefresh)
 * 2. Update if URL already exists in this feed AND article is unread (unless forceRefresh)
 * 3. Skip if article with same name exists in last 2 weeks in this feed (unless forceRefresh)
 *
 * @param article - The article to check
 * @param feedId - The feed ID
 * @param feedUserId - The user ID who owns the feed
 * @param forceRefresh - If true, don't skip existing articles
 * @returns Object with shouldSkip, shouldUpdate booleans, optional reason, and existing article
 */
export async function shouldSkipArticleByDuplicate(
  article: { url: string; title: string },
  feedId: number,
  feedUserId: number | null,
  forceRefresh: boolean,
): Promise<{
  shouldSkip: boolean;
  shouldUpdate: boolean;
  reason: string | null;
  existingArticle?: Article;
}> {
  // Import here to avoid circular dependency
  const { db, articles, userArticleStates } = await import("../../db");
  const { eq, and, gte } = await import("drizzle-orm");

  // If forcing refresh, don't skip
  if (forceRefresh) {
    return { shouldSkip: false, shouldUpdate: false, reason: null };
  }

  // Check 1: URL already exists in this feed
  const [existingByUrl] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.url, article.url), eq(articles.feedId, feedId)))
    .limit(1);

  if (existingByUrl) {
    // Check if article is read by the feed owner
    if (feedUserId !== null) {
      const [readState] = await db
        .select()
        .from(userArticleStates)
        .where(
          and(
            eq(userArticleStates.userId, feedUserId),
            eq(userArticleStates.articleId, existingByUrl.id),
          ),
        )
        .limit(1);

      const isRead = readState?.isRead ?? false;

      if (isRead) {
        // Article exists and is read: skip
        return {
          shouldSkip: true,
          shouldUpdate: false,
          reason: null,
          existingArticle: existingByUrl,
        };
      } else {
        // Article exists but is unread: update instead of skip
        return {
          shouldSkip: false,
          shouldUpdate: true,
          reason: null,
          existingArticle: existingByUrl,
        };
      }
    } else {
      // No userId (shouldn't happen, but handle gracefully): skip
      return {
        shouldSkip: true,
        shouldUpdate: false,
        reason: null,
        existingArticle: existingByUrl,
      };
    }
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
      shouldUpdate: false,
      reason: `Article with same name exists in last 2 weeks: ${article.title}`,
    };
  }

  // Don't skip
  return { shouldSkip: false, shouldUpdate: false, reason: null };
}
