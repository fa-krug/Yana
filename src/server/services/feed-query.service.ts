/**
 * Feed query service - handles feed querying operations.
 */

import { eq, and, or, isNull, desc, sql, like, inArray } from "drizzle-orm";
import {
  db,
  feeds,
  articles,
  userArticleStates,
  feedGroups,
  groups,
} from "../db";
import { NotFoundError, PermissionDeniedError } from "../errors";
import type { Feed, User } from "../db/types";

/**
 * Minimal user info needed for feed operations.
 */
type UserInfo = Pick<User, "id" | "isSuperuser">;

/**
 * List feeds for a user.
 */
export async function listFeeds(
  user: UserInfo,
  filters: {
    search?: string;
    feedType?: string;
    enabled?: boolean;
    groupId?: number;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<{ feeds: Feed[]; total: number }> {
  const {
    search,
    feedType,
    enabled,
    groupId,
    page = 1,
    pageSize = 20,
  } = filters;
  const offset = (page - 1) * pageSize;

  // Build where conditions
  const conditions = [
    // User can see their own feeds or shared feeds (user_id = null)
    or(eq(feeds.userId, user.id), isNull(feeds.userId)),
  ];

  if (search) {
    conditions.push(like(feeds.name, `%${search}%`));
  }

  if (feedType) {
    conditions.push(
      eq(
        feeds.feedType,
        feedType as "article" | "youtube" | "podcast" | "reddit",
      ),
    );
  }

  if (enabled !== undefined) {
    conditions.push(eq(feeds.enabled, enabled));
  }

  // If filtering by group, join with feed_groups
  if (groupId) {
    // Verify group access
    const [group] = await db
      .select()
      .from(groups)
      .where(
        and(
          eq(groups.id, groupId),
          or(eq(groups.userId, user.id), isNull(groups.userId)),
        ),
      )
      .limit(1);

    if (!group) {
      throw new NotFoundError(`Group with id ${groupId} not found`);
    }

    // Get feed IDs in this group
    const feedIdsInGroup = await db
      .select({ feedId: feedGroups.feedId })
      .from(feedGroups)
      .where(eq(feedGroups.groupId, groupId));

    const feedIdArray = feedIdsInGroup.map((f) => f.feedId);

    if (feedIdArray.length === 0) {
      return { feeds: [], total: 0 };
    }

    // Add feed ID filter
    conditions.push(inArray(feeds.id, feedIdArray));
  }

  const whereClause = and(...conditions);

  // Get total count
  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(feeds)
    .where(whereClause);

  const total = totalResult[0]?.count || 0;

  // Get feeds
  const feedList = await db
    .select()
    .from(feeds)
    .where(whereClause)
    .orderBy(desc(feeds.createdAt))
    .limit(pageSize)
    .offset(offset);

  return { feeds: feedList, total };
}

/**
 * Get feed by ID.
 */
export async function getFeed(id: number, user: UserInfo): Promise<Feed> {
  const [feed] = await db.select().from(feeds).where(eq(feeds.id, id)).limit(1);

  if (!feed) {
    throw new NotFoundError(`Feed with id ${id} not found`);
  }

  // Check access: user must own feed or feed must be shared (user_id = null)
  if (feed.userId !== null && feed.userId !== user.id && !user.isSuperuser) {
    throw new PermissionDeniedError("You do not have access to this feed");
  }

  return feed;
}

/**
 * Get feed aggregator metadata.
 */
export async function getFeedAggregatorMetadata(
  feed: Feed,
): Promise<Record<string, unknown>> {
  const { getAggregatorMetadata } = await import("./aggregator.service");
  try {
    const metadata = getAggregatorMetadata(feed.aggregator);
    if (!metadata) {
      return {};
    }
    return {
      name: metadata.name,
      type: metadata.type,
      description: metadata.description,
      url: metadata.url,
      identifier_label: metadata.identifierLabel,
    };
  } catch {
    return {};
  }
}

/**
 * Get article count for a feed.
 */
export async function getFeedArticleCount(feedId: number): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(articles)
    .where(eq(articles.feedId, feedId));

  return result[0]?.count || 0;
}

/**
 * Get unread article count for a feed and user.
 */
export async function getFeedUnreadCount(
  feedId: number,
  userId: number,
): Promise<number> {
  // Get all article IDs for this feed
  const feedArticles = await db
    .select({ id: articles.id })
    .from(articles)
    .where(eq(articles.feedId, feedId));

  if (feedArticles.length === 0) {
    return 0;
  }

  const articleIds = feedArticles.map((a) => a.id);

  // Get read article IDs for this user
  const readStates = await db
    .select({ articleId: userArticleStates.articleId })
    .from(userArticleStates)
    .where(
      and(
        eq(userArticleStates.userId, userId),
        eq(userArticleStates.isRead, true),
        inArray(userArticleStates.articleId, articleIds),
      ),
    );

  const readIds = new Set(readStates.map((s) => s.articleId));

  // Count unread: articles that are not in the read list
  return articleIds.filter((id) => !readIds.has(id)).length;
}
