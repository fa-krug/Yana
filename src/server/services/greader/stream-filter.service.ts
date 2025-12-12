/**
 * Stream filter service - handles filtering articles by stream ID.
 */

import { eq, and, or, isNull, inArray } from "drizzle-orm";
import {
  db,
  articles,
  feeds,
  userArticleStates,
  groups,
  feedGroups,
} from "@server/db";

const STATE_READING_LIST = "user/-/state/com.google/reading-list";
const STATE_STARRED = "user/-/state/com.google/starred";

/**
 * Filter articles by stream ID.
 * Uses a generic type parameter to preserve the input query type while allowing
 * new query builders to be returned. The constraint accepts any object to work
 * with Drizzle's complex query builder types.
 *
 * Note: Type assertions are used internally because Drizzle's query builder
 * types are complex and incompatible even when runtime-compatible.
 */
export async function filterArticlesByStream<T extends Record<string, unknown>>(
  query: T,
  streamId: string,
  userId: number,
): Promise<T> {
  if (!streamId || streamId === STATE_READING_LIST) {
    return query;
  }

  if (streamId === STATE_STARRED) {
    // Get starred article IDs directly from database
    const starredIds = await db
      .select({ articleId: userArticleStates.articleId })
      .from(userArticleStates)
      .where(
        and(
          eq(userArticleStates.userId, userId),
          eq(userArticleStates.isSaved, true),
        ),
      );
    const starredArticleIds = starredIds.map((s) => s.articleId);

    if (starredArticleIds.length === 0) {
      // No starred articles, return empty query with full selection
      return db
        .select({
          id: articles.id,
          name: articles.name,
          url: articles.url,
          date: articles.date,
          updatedAt: articles.updatedAt,
          content: articles.content,
          feedId: articles.feedId,
          feedName: feeds.name,
          feedIdentifier: feeds.identifier,
          feedType: feeds.feedType,
        })
        .from(articles)
        .innerJoin(feeds, eq(articles.feedId, feeds.id))
        .where(eq(articles.id, -1)) as unknown as T; // Impossible condition
    }

    // Get accessible feed IDs for access control
    const accessibleFeeds = await db
      .select({ id: feeds.id })
      .from(feeds)
      .where(
        and(
          or(eq(feeds.userId, userId), isNull(feeds.userId)),
          eq(feeds.enabled, true),
        ),
      );
    const accessibleFeedIds = accessibleFeeds.map((f) => f.id);

    if (accessibleFeedIds.length === 0) {
      // No accessible feeds, return empty query
      return db
        .select({
          id: articles.id,
          name: articles.name,
          url: articles.url,
          date: articles.date,
          updatedAt: articles.updatedAt,
          content: articles.content,
          feedId: articles.feedId,
          feedName: feeds.name,
          feedIdentifier: feeds.identifier,
          feedType: feeds.feedType,
        })
        .from(articles)
        .innerJoin(feeds, eq(articles.feedId, feeds.id))
        .where(eq(articles.id, -1)) as unknown as T; // Impossible condition
    }

    // Build a new query that filters by both starred IDs and accessible feed IDs
    return db
      .select({
        id: articles.id,
        name: articles.name,
        url: articles.url,
        date: articles.date,
        updatedAt: articles.updatedAt,
        content: articles.content,
        feedId: articles.feedId,
        feedName: feeds.name,
        feedIdentifier: feeds.identifier,
        feedType: feeds.feedType,
      })
      .from(articles)
      .innerJoin(feeds, eq(articles.feedId, feeds.id))
      .where(
        and(
          inArray(articles.id, starredArticleIds),
          inArray(articles.feedId, accessibleFeedIds),
        ),
      ) as unknown as T;
  }

  // Handle feed/ stream
  if (streamId.startsWith("feed/")) {
    const feedId = parseInt(streamId.slice(5), 10);
    if (!isNaN(feedId)) {
      return db
        .select({
          id: articles.id,
          name: articles.name,
          url: articles.url,
          date: articles.date,
          updatedAt: articles.updatedAt,
          content: articles.content,
          feedId: articles.feedId,
          feedName: feeds.name,
          feedIdentifier: feeds.identifier,
          feedType: feeds.feedType,
        })
        .from(articles)
        .innerJoin(feeds, eq(articles.feedId, feeds.id))
        .where(
          and(
            eq(articles.feedId, feedId),
            or(eq(feeds.userId, userId), isNull(feeds.userId)),
            eq(feeds.enabled, true),
          ),
        ) as unknown as T;
    }
  }

  // Handle label/ stream (tag/group)
  if (streamId.startsWith("label/")) {
    const labelName = streamId.slice(6);
    return (await handleLabelStream<T>(labelName, userId)) as T;
  }

  // Handle user/-/label/ stream (alternative format)
  if (streamId.startsWith("user/-/label/")) {
    const labelName = streamId.slice(13);
    return (await handleLabelStream<T>(labelName, userId)) as T;
  }

  return query;
}

/**
 * Handle label stream filtering (for both label/ and user/-/label/ formats).
 */
async function handleLabelStream<T extends Record<string, unknown>>(
  labelName: string,
  userId: number,
): Promise<T> {
  // Special case: Reddit feed type
  if (labelName === "Reddit") {
    return db
      .select({
        id: articles.id,
        name: articles.name,
        url: articles.url,
        date: articles.date,
        updatedAt: articles.updatedAt,
        content: articles.content,
        feedId: articles.feedId,
        feedName: feeds.name,
        feedIdentifier: feeds.identifier,
        feedType: feeds.feedType,
      })
      .from(articles)
      .innerJoin(feeds, eq(articles.feedId, feeds.id))
      .where(
        and(
          eq(feeds.feedType, "reddit"),
          or(eq(feeds.userId, userId), isNull(feeds.userId)),
          eq(feeds.enabled, true),
        ),
      ) as unknown as T;
  }

  // Special case: YouTube feed type
  if (labelName === "YouTube") {
    return db
      .select({
        id: articles.id,
        name: articles.name,
        url: articles.url,
        date: articles.date,
        updatedAt: articles.updatedAt,
        content: articles.content,
        feedId: articles.feedId,
        feedName: feeds.name,
        feedIdentifier: feeds.identifier,
        feedType: feeds.feedType,
      })
      .from(articles)
      .innerJoin(feeds, eq(articles.feedId, feeds.id))
      .where(
        and(
          eq(feeds.feedType, "youtube"),
          or(eq(feeds.userId, userId), isNull(feeds.userId)),
          eq(feeds.enabled, true),
        ),
      ) as unknown as T;
  }

  // Special case: podcast feed type
  if (labelName === "podcast" || labelName === "Podcasts") {
    return db
      .select({
        id: articles.id,
        name: articles.name,
        url: articles.url,
        date: articles.date,
        updatedAt: articles.updatedAt,
        content: articles.content,
        feedId: articles.feedId,
        feedName: feeds.name,
        feedIdentifier: feeds.identifier,
        feedType: feeds.feedType,
      })
      .from(articles)
      .innerJoin(feeds, eq(articles.feedId, feeds.id))
      .where(
        and(
          eq(feeds.feedType, "podcast"),
          or(eq(feeds.userId, userId), isNull(feeds.userId)),
          eq(feeds.enabled, true),
        ),
      ) as unknown as T;
  }

  // Get group feeds
  const [group] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(
      and(
        eq(groups.name, labelName),
        or(eq(groups.userId, userId), isNull(groups.userId)),
      ),
    )
    .limit(1);

  if (group) {
    const groupFeedIds = await db
      .select({ feedId: feedGroups.feedId })
      .from(feedGroups)
      .where(eq(feedGroups.groupId, group.id));

    const feedIds = groupFeedIds.map((g) => g.feedId);
    if (feedIds.length > 0) {
      return db
        .select({
          id: articles.id,
          name: articles.name,
          url: articles.url,
          date: articles.date,
          updatedAt: articles.updatedAt,
          content: articles.content,
          feedId: articles.feedId,
          feedName: feeds.name,
          feedIdentifier: feeds.identifier,
          feedType: feeds.feedType,
        })
        .from(articles)
        .innerJoin(feeds, eq(articles.feedId, feeds.id))
        .where(inArray(articles.feedId, feedIds)) as unknown as T;
    }
  }

  // Return empty query if no match
  return db
    .select({
      id: articles.id,
      name: articles.name,
      url: articles.url,
      date: articles.date,
      updatedAt: articles.updatedAt,
      content: articles.content,
      feedId: articles.feedId,
      feedName: feeds.name,
      feedIdentifier: feeds.identifier,
      feedType: feeds.feedType,
    })
    .from(articles)
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .where(eq(articles.id, -1)) as unknown as T; // Impossible condition
}
