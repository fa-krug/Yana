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
  lt,
  notInArray,
  sql,
} from "drizzle-orm";

import { db, articles, feeds, userArticleStates } from "@server/db";
import { cache } from "@server/utils/cache";

import { filterArticlesByStream } from "./stream-filter.service";
import { parseItemId, formatStreamItem } from "./stream-format.service";

const STATE_READ = "user/-/state/com.google/read";
const STATE_STARRED = "user/-/state/com.google/starred";
const STATE_READING_LIST = "user/-/state/com.google/reading-list";

interface StreamItem {
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
}

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
  items: StreamItem[];
  continuation?: string;
}> {
  const offset = continuation ? parseInt(continuation, 10) || 0 : 0;
  const readIdArray = excludeTag === STATE_READ ? await fetchStateArticleIds(userId, STATE_READ) : [];
  
  let timestampDate: Date | null = null;
  if (olderThan) {
    const ts = parseInt(olderThan, 10);
    if (!isNaN(ts)) timestampDate = new Date(ts * 1000);
  }

  const baseConditions = [or(eq(feeds.userId, userId), isNull(feeds.userId)), eq(feeds.enabled, true)];

  if (itemIds && itemIds.length > 0) {
    const parsedIds = itemIds.map((id) => parseItemId(id)).filter((id) => id > 0);
    if (parsedIds.length === 0) return { id: streamId || STATE_READING_LIST, updated: Math.floor(Date.now() / 1000), items: [] };
    baseConditions.push(inArray(articles.id, parsedIds));
  }

  if (readIdArray.length > 0) baseConditions.push(notInArray(articles.id, readIdArray));
  if (timestampDate) baseConditions.push(lt(articles.date, timestampDate));

  const baseQuery = db.select({
    id: articles.id, name: articles.name, url: articles.url, date: articles.date,
    updatedAt: articles.updatedAt, content: articles.content, feedId: articles.feedId,
    feedName: feeds.name, feedIdentifier: feeds.identifier, feedType: feeds.feedType,
  }).from(articles).innerJoin(feeds, eq(articles.feedId, feeds.id)).where(and(...baseConditions));

  let articleQuery: typeof baseQuery = baseQuery;

  if (!itemIds || itemIds.length === 0) {
    articleQuery = await filterArticlesByStream(articleQuery, streamId, userId) as typeof baseQuery;
  }

  const allArticles = await articleQuery.orderBy(desc(articles.date)).limit(offset + limit);
  const paginatedArticles = allArticles.slice(offset, offset + limit);

  const articleIds = paginatedArticles.map((a) => a.id);
  const states = articleIds.length > 0 ? await db.select().from(userArticleStates).where(and(eq(userArticleStates.userId, userId), inArray(userArticleStates.articleId, articleIds))) : [];
  const stateMap = new Map(states.map((s) => [s.articleId, s]));

  const items = paginatedArticles.map((article) => {
    const state = stateMap.get(article.id);
    const categories = [STATE_READING_LIST];
    if (state?.isRead) categories.push(STATE_READ);
    if (state?.isSaved) categories.push(STATE_STARRED);
    const formatted = formatStreamItem(article) as StreamItem;
    formatted.categories = categories;
    return formatted;
  });

  const response: { id: string; updated: number; items: StreamItem[]; continuation?: string } = { 
    id: streamId || STATE_READING_LIST, 
    updated: Math.floor(Date.now() / 1000), 
    items 
  };
  if (paginatedArticles.length === limit) response.continuation = String(offset + limit);
  return response;
}

/**
 * Fetch filtered article IDs for a user state.
 */
async function fetchStateArticleIds(userId: number, stateKey: string): Promise<number[]> {
  const states = await db.select({ articleId: userArticleStates.articleId }).from(userArticleStates)
    .where(and(eq(userArticleStates.userId, userId), stateKey === STATE_READ ? eq(userArticleStates.isRead, true) : eq(userArticleStates.isSaved, true)));
  return states.map((s) => s.articleId);
}

/**
 * Handle the starred stream special case for item IDs.
 */
async function getStarredStreamQuery(userId: number, readIdArray: number[], timestampDate: Date | null) {
  const starredArticleIds = await fetchStateArticleIds(userId, STATE_STARRED);
  if (starredArticleIds.length === 0) return null;

  const accessibleFeeds = await db.select({ id: feeds.id }).from(feeds)
    .where(and(or(eq(feeds.userId, userId), isNull(feeds.userId)), eq(feeds.enabled, true)));
  const accessibleFeedIds = accessibleFeeds.map((f) => f.id);
  if (accessibleFeedIds.length === 0) return null;

  const conditions = [inArray(articles.id, starredArticleIds), inArray(articles.feedId, accessibleFeedIds)];
  if (readIdArray.length > 0) conditions.push(notInArray(articles.id, readIdArray));
  if (timestampDate) conditions.push(lt(articles.date, timestampDate));

  return db.select({ id: articles.id }).from(articles).innerJoin(feeds, eq(articles.feedId, feeds.id)).where(and(...conditions));
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

  const readIdArray = excludeTag === STATE_READ ? await fetchStateArticleIds(userId, STATE_READ) : [];
  const starredIdArray = includeTag === STATE_STARRED ? await fetchStateArticleIds(userId, STATE_STARRED) : [];
  if (includeTag === STATE_STARRED && starredIdArray.length === 0) return { itemRefs: [] };

  let timestampDate: Date | null = null;
  if (olderThan) {
    const ts = parseInt(olderThan, 10);
    if (!isNaN(ts)) timestampDate = new Date(ts * 1000);
  }

  let articleQuery: ReturnType<typeof db.select>;
  if (streamId === STATE_STARRED) {
    const starredQuery = await getStarredStreamQuery(userId, readIdArray, timestampDate);
    if (!starredQuery) return { itemRefs: [] };
    articleQuery = starredQuery;
  } else {
    const baseConditions = [or(eq(feeds.userId, userId), isNull(feeds.userId)), eq(feeds.enabled, true)];
    if (readIdArray.length > 0) baseConditions.push(notInArray(articles.id, readIdArray));
    if (starredIdArray.length > 0) baseConditions.push(inArray(articles.id, starredIdArray));
    if (timestampDate) baseConditions.push(lt(articles.date, timestampDate));

    const query = db.select({ id: articles.id }).from(articles).innerJoin(feeds, eq(articles.feedId, feeds.id)).where(and(...baseConditions));
    articleQuery = query;

    if (streamId && streamId !== STATE_READING_LIST) {
      articleQuery = await filterArticlesByStream(articleQuery, streamId, userId) as typeof query;
    }
  }

  const order = reverseOrder ? asc(articles.date) : desc(articles.date);
  const articleIds = await (articleQuery as unknown as { orderBy: (order: unknown) => { limit: (limit: number) => Promise<Array<{ id: number }>> } }).orderBy(order).limit(limit);

  return { itemRefs: articleIds.map((a) => ({ id: String(a.id) })) };
}

/**
 * Format feed unread count.
 */
function formatUnreadCount(
  stat: { feedId: number; totalArticles: number | string; newestDate: number | null }, 
  readCount: number, 
  includeAll: boolean
): { id: string; count: number; newestItemTimestampUsec: string } | null {
  const unreadCount = (Number(stat.totalArticles) || 0) - readCount;
  if (unreadCount > 0 || includeAll) {
    const newestDate = stat.newestDate ? Number(stat.newestDate) : null;
    return {
      id: `feed/${stat.feedId}`,
      count: unreadCount,
      newestItemTimestampUsec: newestDate ? String(Math.floor(newestDate / 1000) * 1000000) : "0",
    };
  }
  return null;
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
  const cacheKey = `unread_counts_${userId}_${includeAll}`;
  type UnreadCountResult = { max: number; unreadcounts: Array<{ id: string; count: number; newestItemTimestampUsec: string }> };
  const cached = cache.get<UnreadCountResult>(cacheKey);
  if (cached !== null) return cached;

  const feedStats = await db.select({
    feedId: feeds.id,
    totalArticles: sql<number>`COUNT(${articles.id})`.as("total_articles"),
    newestDate: sql<number>`MAX(${articles.date})`.as("newest_date"),
  }).from(feeds).leftJoin(articles, eq(articles.feedId, feeds.id))
    .where(and(or(eq(feeds.userId, userId), isNull(feeds.userId)), eq(feeds.enabled, true))).groupBy(feeds.id);

  const readCounts = await db.select({
    feedId: articles.feedId,
    readCount: sql<number>`COUNT(${userArticleStates.articleId})`.as("read_count"),
  }).from(userArticleStates).innerJoin(articles, eq(userArticleStates.articleId, articles.id)).innerJoin(feeds, eq(articles.feedId, feeds.id))
    .where(and(eq(userArticleStates.userId, userId), eq(userArticleStates.isRead, true), or(eq(feeds.userId, userId), isNull(feeds.userId)), eq(feeds.enabled, true))).groupBy(articles.feedId);

  const readCountMap = new Map(readCounts.map((r) => [r.feedId, Number(r.readCount) || 0]));
  const unreadCountsList: Array<{ id: string; count: number; newestItemTimestampUsec: string }> = [];
  let totalUnread = 0;

  for (const stat of feedStats) {
    const formatted = formatUnreadCount(stat, readCountMap.get(stat.feedId) || 0, includeAll);
    if (formatted) {
      unreadCountsList.push(formatted);
      totalUnread += formatted.count;
    }
  }

  const result = { max: totalUnread, unreadcounts: unreadCountsList };
  cache.set(cacheKey, result, 30);
  return result;
}
