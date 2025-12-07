/**
 * Statistics service.
 *
 * Handles statistics calculation for dashboard.
 */

import { eq, and, or, isNull, sql, gte, inArray } from "drizzle-orm";
import { db, articles, feeds, userArticleStates } from "../db";
import type { UserInfo } from "./article.service";
import { cache } from "../utils/cache";

/**
 * Statistics data structure.
 */
export interface Statistics {
  totalFeeds: number;
  totalArticles: number;
  totalUnread: number;
  readPercentage: number;
  articleFeeds: number;
  videoFeeds: number;
  podcastFeeds: number;
  redditFeeds: number;
  articlesToday: number;
  articlesThisWeek: number;
}

/**
 * Get statistics for a user.
 * Cached for 60 seconds per user to reduce database load.
 */
export async function getStatistics(user: UserInfo): Promise<Statistics> {
  // Cache key includes user ID to ensure user-specific caching
  const cacheKey = `statistics_${user.id}`;

  // Try to get from cache
  const cached = cache.get<Statistics>(cacheKey);
  if (cached !== null) {
    return cached;
  }

  // Get accessible feed IDs (user's feeds or shared feeds)
  const accessibleFeeds = await db
    .select({ id: feeds.id, feedType: feeds.feedType })
    .from(feeds)
    .where(or(eq(feeds.userId, user.id), isNull(feeds.userId)));

  const feedIds = accessibleFeeds.map((f) => f.id);

  if (feedIds.length === 0) {
    return {
      totalFeeds: 0,
      totalArticles: 0,
      totalUnread: 0,
      readPercentage: 0,
      articleFeeds: 0,
      videoFeeds: 0,
      podcastFeeds: 0,
      redditFeeds: 0,
      articlesToday: 0,
      articlesThisWeek: 0,
    };
  }

  // Count feeds by type
  const feedTypeCounts = accessibleFeeds.reduce(
    (acc, feed) => {
      acc[feed.feedType] = (acc[feed.feedType] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  // Get total article count
  const totalArticlesResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(articles)
    .where(inArray(articles.feedId, feedIds));

  const totalArticles = totalArticlesResult[0]?.count || 0;

  // Get read article count for this user
  const readArticlesResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(userArticleStates)
    .innerJoin(articles, eq(userArticleStates.articleId, articles.id))
    .where(
      and(
        eq(userArticleStates.userId, user.id),
        eq(userArticleStates.isRead, true),
        inArray(articles.feedId, feedIds),
      ),
    );

  const readCount = readArticlesResult[0]?.count || 0;
  const totalUnread = totalArticles - readCount;
  const readPercentage =
    totalArticles > 0 ? Math.round((readCount / totalArticles) * 100) : 0;

  // Get articles from today (start of day)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const articlesTodayResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(articles)
    .where(and(inArray(articles.feedId, feedIds), gte(articles.date, today)));

  const articlesToday = articlesTodayResult[0]?.count || 0;

  // Get articles from this week (7 days ago)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  weekAgo.setHours(0, 0, 0, 0);

  const articlesThisWeekResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(articles)
    .where(and(inArray(articles.feedId, feedIds), gte(articles.date, weekAgo)));

  const articlesThisWeek = articlesThisWeekResult[0]?.count || 0;

  const result: Statistics = {
    totalFeeds: accessibleFeeds.length,
    totalArticles,
    totalUnread,
    readPercentage,
    articleFeeds: feedTypeCounts["article"] || 0,
    videoFeeds: feedTypeCounts["youtube"] || 0,
    podcastFeeds: feedTypeCounts["podcast"] || 0,
    redditFeeds: feedTypeCounts["reddit"] || 0,
    articlesToday,
    articlesThisWeek,
  };

  // Cache for 60 seconds
  cache.set(cacheKey, result, 60);

  return result;
}
