/**
 * Google Reader API stream service.
 */

import {
  eq,
  and,
  or,
  isNull,
  inArray,
  desc,
  asc,
  gte,
  lte,
  lt,
  sql,
  notInArray,
} from "drizzle-orm";
import {
  db,
  articles,
  feeds,
  userArticleStates,
  groups,
  feedGroups,
} from "../../db";
import { cache } from "../../utils/cache";

const STATE_READ = "user/-/state/com.google/read";
const STATE_STARRED = "user/-/state/com.google/starred";
const STATE_READING_LIST = "user/-/state/com.google/reading-list";

/**
 * Get stream contents.
 */
export async function getStreamContents(
  userId: number,
  streamId: string,
  itemIds: string[],
  excludeTag: string,
  limit: number,
  olderThan: string,
  continuation: string,
): Promise<{
  id: string;
  updated: number;
  items: Array<{
    id: string;
    title: string;
    published: number;
    updated: number;
    crawlTimeMsec: string;
    timestampUsec: string;
    alternate: Array<{ href: string }>;
    canonical: Array<{ href: string }>;
    categories: string[];
    origin: {
      streamId: string;
      title: string;
      htmlUrl: string;
    };
    summary: { content: string };
  }>;
  continuation?: string;
}> {
  let offset = 0;
  if (continuation) {
    const parsed = parseInt(continuation, 10);
    if (!isNaN(parsed)) {
      offset = parsed;
    }
  }

  // Get read article IDs for exclusion (database-level filtering)
  let readIdArray: number[] = [];
  if (excludeTag === STATE_READ) {
    const readIds = await db
      .select({ articleId: userArticleStates.articleId })
      .from(userArticleStates)
      .where(
        and(
          eq(userArticleStates.userId, userId),
          eq(userArticleStates.isRead, true),
        ),
      );
    readIdArray = readIds.map((r) => r.articleId);
  }

  // Parse timestamp for filtering
  let timestampDate: Date | null = null;
  if (olderThan) {
    const timestamp = parseInt(olderThan, 10);
    if (!isNaN(timestamp)) {
      timestampDate = new Date(timestamp * 1000);
    }
  }

  // Build base conditions
  const baseConditions = [
    or(eq(feeds.userId, userId), isNull(feeds.userId)),
    eq(feeds.enabled, true),
  ];

  // Filter by item IDs
  if (itemIds && itemIds.length > 0) {
    const parsedIds = itemIds
      .map((id) => parseItemId(id))
      .filter((id) => id > 0);

    if (parsedIds.length > 0) {
      baseConditions.push(inArray(articles.id, parsedIds));
    } else {
      return {
        id: streamId || STATE_READING_LIST,
        updated: Math.floor(Date.now() / 1000),
        items: [],
      };
    }
  }

  // Add read exclusion
  if (readIdArray.length > 0) {
    baseConditions.push(notInArray(articles.id, readIdArray));
  }

  // Add timestamp filter
  if (timestampDate) {
    baseConditions.push(lt(articles.date, timestampDate));
  }

  // Build base query
  let articleQuery = db
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
    .where(and(...baseConditions));

  // Apply stream filtering if not filtering by item IDs
  if (!itemIds || itemIds.length === 0) {
    articleQuery = await filterArticlesByStream(articleQuery, streamId, userId);
  }

  // Order and limit - fetch only what we need for pagination
  const fetchLimit = offset + limit;
  const allArticles = await articleQuery
    .orderBy(desc(articles.date))
    .limit(fetchLimit);

  // Apply pagination
  const paginatedArticles = allArticles.slice(offset, offset + limit);

  // Get user states
  const articleIds = paginatedArticles.map((a) => a.id);
  const states =
    articleIds.length > 0
      ? await db
          .select()
          .from(userArticleStates)
          .where(
            and(
              eq(userArticleStates.userId, userId),
              inArray(userArticleStates.articleId, articleIds),
            ),
          )
      : [];

  const stateMap = new Map(states.map((s) => [s.articleId, s]));

  // Build items
  const items = paginatedArticles.map((article) => {
    const state = stateMap.get(article.id);
    const categories = [STATE_READING_LIST];
    if (state?.isRead) {
      categories.push(STATE_READ);
    }
    if (state?.isSaved) {
      categories.push(STATE_STARRED);
    }

    const timestampSec = Math.floor(article.date.getTime() / 1000);
    const updatedSec = Math.floor(article.updatedAt.getTime() / 1000);
    const timestampUsec = timestampSec * 1000000;
    const crawlTimeMsec = timestampSec * 1000;

    return {
      id: `tag:google.com,2005:reader/item/${toHexId(article.id)}`,
      title: article.name,
      published: timestampSec,
      updated: updatedSec,
      crawlTimeMsec: String(crawlTimeMsec),
      timestampUsec: String(timestampUsec),
      alternate: [{ href: article.url }],
      canonical: [{ href: article.url }],
      categories,
      origin: {
        streamId: `feed/${article.feedId}`,
        title: article.feedName,
        htmlUrl: getSiteUrl(article),
      },
      summary: { content: article.content },
    };
  });

  const response: {
    id: string;
    updated: number;
    items: typeof items;
    continuation?: string;
  } = {
    id: streamId || STATE_READING_LIST,
    updated: Math.floor(Date.now() / 1000),
    items,
  };

  // Add continuation if there might be more
  if (paginatedArticles.length === limit) {
    response.continuation = String(offset + limit);
  }

  return response;
}

/**
 * Get stream item IDs.
 */
export async function getStreamItemIds(
  userId: number,
  streamId: string,
  limit: number,
  olderThan: string,
  excludeTag: string,
  includeTag: string,
  reverseOrder: boolean,
): Promise<{ itemRefs: Array<{ id: string }> }> {
  limit = Math.min(limit, 10000);

  // Get read/starred article IDs for filtering (database-level)
  let readIdArray: number[] = [];
  if (excludeTag === STATE_READ) {
    const readIds = await db
      .select({ articleId: userArticleStates.articleId })
      .from(userArticleStates)
      .where(
        and(
          eq(userArticleStates.userId, userId),
          eq(userArticleStates.isRead, true),
        ),
      );
    readIdArray = readIds.map((r) => r.articleId);
  }

  let starredIdArray: number[] = [];
  if (includeTag === STATE_STARRED) {
    const starredIds = await db
      .select({ articleId: userArticleStates.articleId })
      .from(userArticleStates)
      .where(
        and(
          eq(userArticleStates.userId, userId),
          eq(userArticleStates.isSaved, true),
        ),
      );
    starredIdArray = starredIds.map((s) => s.articleId);
    if (starredIdArray.length === 0) {
      return { itemRefs: [] };
    }
  }

  // Parse timestamp for filtering
  let timestampDate: Date | null = null;
  if (olderThan) {
    const timestamp = parseInt(olderThan, 10);
    if (!isNaN(timestamp)) {
      timestampDate = new Date(timestamp * 1000);
    }
  }

  // Build base conditions
  const baseConditions = [
    or(eq(feeds.userId, userId), isNull(feeds.userId)),
    eq(feeds.enabled, true),
  ];

  // Add read exclusion
  if (readIdArray.length > 0) {
    baseConditions.push(notInArray(articles.id, readIdArray));
  }

  // Add starred inclusion
  if (starredIdArray.length > 0) {
    baseConditions.push(inArray(articles.id, starredIdArray));
  }

  // Add timestamp filter
  if (timestampDate) {
    baseConditions.push(lt(articles.date, timestampDate));
  }

  // Build base query
  let articleQuery = db
    .select({ id: articles.id })
    .from(articles)
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .where(and(...baseConditions));

  // Filter by stream (skip for reading list as it doesn't need filtering)
  // Special handling for starred stream - handle it directly to maintain query structure
  if (streamId && streamId !== STATE_READING_LIST) {
    if (streamId === STATE_STARRED) {
      // Handle starred stream directly to maintain id-only select structure
      // Reuse starredIdArray if already populated from includeTag, otherwise fetch it
      let starredArticleIds: number[];
      if (starredIdArray.length > 0) {
        starredArticleIds = starredIdArray;
      } else {
        const starredIds = await db
          .select({ articleId: userArticleStates.articleId })
          .from(userArticleStates)
          .where(
            and(
              eq(userArticleStates.userId, userId),
              eq(userArticleStates.isSaved, true),
            ),
          );
        starredArticleIds = starredIds.map((s) => s.articleId);
      }

      if (starredArticleIds.length === 0) {
        // Return empty result
        return { itemRefs: [] };
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
        return { itemRefs: [] };
      }

      // Build query with only id field to match the base query structure
      // Preserve read exclusion and timestamp filters from baseConditions
      const starredConditions = [
        inArray(articles.id, starredArticleIds),
        inArray(articles.feedId, accessibleFeedIds),
      ];

      // Add read exclusion if present (baseConditions[2] if it exists)
      if (readIdArray.length > 0) {
        starredConditions.push(notInArray(articles.id, readIdArray));
      }

      // Add timestamp filter if present (last condition if timestampDate exists)
      if (timestampDate) {
        starredConditions.push(lt(articles.date, timestampDate));
      }

      articleQuery = db
        .select({ id: articles.id })
        .from(articles)
        .innerJoin(feeds, eq(articles.feedId, feeds.id))
        .where(and(...starredConditions));
    } else {
      articleQuery = await filterArticlesByStream(
        articleQuery,
        streamId,
        userId,
      );

      // Debug: Check if query builder is valid
      if (!articleQuery || typeof articleQuery.orderBy !== "function") {
        console.error("Invalid query builder after filterArticlesByStream:", {
          type: typeof articleQuery,
          hasOrderBy: typeof articleQuery?.orderBy,
          keys: articleQuery ? Object.keys(articleQuery) : [],
          constructor: articleQuery?.constructor?.name,
          streamId,
        });
        throw new Error(
          `Invalid query builder returned from filterArticlesByStream for stream: ${streamId}`,
        );
      }
    }
  }

  // Order and limit
  const order = reverseOrder ? asc(articles.date) : desc(articles.date);
  const articleIds = await articleQuery.orderBy(order).limit(limit);

  return {
    itemRefs: articleIds.map((a) => ({ id: String(a.id) })),
  };
}

/**
 * Get unread counts.
 */
export async function getUnreadCount(
  userId: number,
  includeAll: boolean,
): Promise<{
  max: number;
  unreadcounts: Array<{
    id: string;
    count: number;
    newestItemTimestampUsec: string;
  }>;
}> {
  // Try cache
  const cacheKey = `unread_counts_${userId}_${includeAll}`;
  const cached = cache.get<typeof result>(cacheKey);
  if (cached !== null) {
    return cached;
  }

  // Get feeds with optimized unread counts using database aggregations
  const feedStats = await db
    .select({
      feedId: feeds.id,
      totalArticles: sql<number>`COUNT(${articles.id})`.as("total_articles"),
      newestDate: sql<number>`MAX(${articles.date})`.as("newest_date"),
    })
    .from(feeds)
    .leftJoin(articles, eq(articles.feedId, feeds.id))
    .where(
      and(
        or(eq(feeds.userId, userId), isNull(feeds.userId)),
        eq(feeds.enabled, true),
      ),
    )
    .groupBy(feeds.id);

  // Get read article counts per feed using aggregation
  const readCounts = await db
    .select({
      feedId: articles.feedId,
      readCount: sql<number>`COUNT(${userArticleStates.articleId})`.as(
        "read_count",
      ),
    })
    .from(userArticleStates)
    .innerJoin(articles, eq(userArticleStates.articleId, articles.id))
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .where(
      and(
        eq(userArticleStates.userId, userId),
        eq(userArticleStates.isRead, true),
        or(eq(feeds.userId, userId), isNull(feeds.userId)),
        eq(feeds.enabled, true),
      ),
    )
    .groupBy(articles.feedId);

  const readCountMap = new Map(
    readCounts.map((r) => [r.feedId, Number(r.readCount) || 0]),
  );

  const unreadCounts: Array<{
    id: string;
    count: number;
    newestItemTimestampUsec: string;
  }> = [];
  let totalUnread = 0;

  for (const stat of feedStats) {
    const readCount = readCountMap.get(stat.feedId) || 0;
    const totalArticles = Number(stat.totalArticles) || 0;
    const unreadCount = totalArticles - readCount;

    if (unreadCount > 0 || includeAll) {
      // newestDate is a timestamp (number) from SQLite
      const newestDate = stat.newestDate ? Number(stat.newestDate) : null;
      const timestampUsec = newestDate
        ? String(Math.floor(newestDate / 1000) * 1000000)
        : "0";
      unreadCounts.push({
        id: `feed/${stat.feedId}`,
        count: unreadCount,
        newestItemTimestampUsec: timestampUsec,
      });
      totalUnread += unreadCount;
    }
  }

  const result = {
    max: totalUnread,
    unreadcounts: unreadCounts,
  };

  // Cache for 30 seconds
  cache.set(cacheKey, result, 30);

  return result;
}

/**
 * Filter articles by stream ID.
 */
async function filterArticlesByStream(
  query: any,
  streamId: string,
  userId: number,
): Promise<any> {
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
      // This works for both getStreamContents (needs full) and getStreamItemIds (only uses id)
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
        .where(eq(articles.id, -1)); // Impossible condition
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
      // No accessible feeds, return empty query with full selection
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
        .where(eq(articles.id, -1)); // Impossible condition
    }

    // Build a new query that filters by both starred IDs and accessible feed IDs
    // Use full selection to work for both getStreamContents and getStreamItemIds
    // getStreamItemIds will only use the id field, which is fine
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
      );
  }

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
        .where(eq(articles.feedId, feedId));
    }
  }

  if (streamId.startsWith("user/-/label/")) {
    const labelName = streamId.slice(13);
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
        );
    } else if (labelName === "YouTube") {
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
        );
    } else if (labelName === "Podcasts") {
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
        );
    } else {
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
            .where(inArray(articles.feedId, feedIds));
        }
      }
    }
  }

  return query;
}

/**
 * Parse item ID.
 */
function parseItemId(itemId: string): number {
  if (itemId.startsWith("tag:google.com,2005:reader/item/")) {
    const hexId = itemId.slice(32);
    return parseInt(hexId, 16);
  } else if (itemId.length === 16) {
    try {
      return parseInt(itemId, 16);
    } catch {
      // Fall through
    }
  }
  try {
    return parseInt(itemId, 10);
  } catch {
    return 0;
  }
}

/**
 * Convert article ID to hex format.
 */
function toHexId(articleId: number): string {
  return articleId.toString(16).padStart(16, "0");
}

/**
 * Get site URL for a feed.
 */
function getSiteUrl(article: {
  feedIdentifier: string;
  feedType: string;
}): string {
  if (article.feedType === "reddit") {
    const subreddit = article.feedIdentifier.replace(/^r\//, "");
    return `https://www.reddit.com/r/${subreddit}`;
  }

  if (article.feedType === "youtube") {
    const identifier = article.feedIdentifier;
    if (identifier.startsWith("UC") && identifier.length >= 24) {
      return `https://www.youtube.com/channel/${identifier}`;
    } else if (identifier.startsWith("@")) {
      return `https://www.youtube.com/${identifier}`;
    }
    return "https://www.youtube.com";
  }

  if (
    article.feedIdentifier.startsWith("http://") ||
    article.feedIdentifier.startsWith("https://")
  ) {
    try {
      const url = new URL(article.feedIdentifier);
      return `${url.protocol}//${url.host}`;
    } catch {
      return article.feedIdentifier;
    }
  }

  return article.feedIdentifier;
}
