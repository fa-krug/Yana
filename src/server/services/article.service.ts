/**
 * Article service.
 *
 * Handles article management operations.
 */

import {
  eq,
  and,
  or,
  isNull,
  desc,
  asc,
  sql,
  like,
  inArray,
  lt,
  gt,
  gte,
  lte,
} from "drizzle-orm";
import {
  db,
  articles,
  feeds,
  userArticleStates,
  feedGroups,
  groups,
} from "../db";
import { NotFoundError, PermissionDeniedError } from "../errors";
import { logger } from "../utils/logger";
import type {
  Article,
  ArticleInsert,
  User,
  UserArticleState,
} from "../db/types";

/**
 * Minimal user info needed for article operations.
 */
export type UserInfo = Pick<User, "id" | "isSuperuser">;

/**
 * List articles for a user.
 */
export async function listArticles(
  user: UserInfo,
  filters: {
    feedId?: number;
    feedType?: string;
    groupId?: number;
    isRead?: boolean;
    isSaved?: boolean;
    search?: string;
    dateFrom?: Date | string;
    dateTo?: Date | string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<{ articles: Article[]; total: number }> {
  const {
    feedId,
    feedType,
    groupId,
    isRead,
    isSaved,
    search,
    dateFrom,
    dateTo,
    page = 1,
    pageSize = 20,
  } = filters;
  const offset = (page - 1) * pageSize;

  // Build where conditions for feeds (user access)
  const feedConditions = [or(eq(feeds.userId, user.id), isNull(feeds.userId))];

  if (feedId) {
    feedConditions.push(eq(feeds.id, feedId));
  }

  if (feedType) {
    feedConditions.push(eq(feeds.feedType, feedType as any));
  }

  // Get accessible feed IDs
  let accessibleFeeds = await db
    .select({ id: feeds.id })
    .from(feeds)
    .where(and(...feedConditions));

  // If filtering by group, filter feeds by group membership
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

    const groupFeedIds = new Set(feedIdsInGroup.map((f) => f.feedId));

    // Filter accessible feeds to only those in the group
    accessibleFeeds = accessibleFeeds.filter((f) => groupFeedIds.has(f.id));
  }

  const feedIds = accessibleFeeds.map((f) => f.id);

  if (feedIds.length === 0) {
    return { articles: [], total: 0 };
  }

  // Build article conditions
  const articleConditions = [inArray(articles.feedId, feedIds)];

  if (search) {
    articleConditions.push(like(articles.name, `%${search}%`));
  }

  // Date range filtering
  if (dateFrom) {
    const fromDate = dateFrom instanceof Date ? dateFrom : new Date(dateFrom);
    articleConditions.push(gte(articles.date, fromDate));
  }

  if (dateTo) {
    const toDate = dateTo instanceof Date ? dateTo : new Date(dateTo);
    // Set to end of day for inclusive filtering
    toDate.setHours(23, 59, 59, 999);
    articleConditions.push(lte(articles.date, toDate));
  }

  // Build read/saved state conditions using LEFT JOIN
  // We need to handle NULL states (articles that haven't been marked read/saved yet)
  const stateConditions: ReturnType<typeof and>[] = [];

  if (isRead !== undefined) {
    if (isRead) {
      // Read: must have a state entry with isRead = true
      stateConditions.push(eq(userArticleStates.isRead, true));
    } else {
      // Unread: either no state entry (NULL) or isRead = false
      stateConditions.push(
        or(isNull(userArticleStates.id), eq(userArticleStates.isRead, false)),
      );
    }
  }

  if (isSaved !== undefined) {
    if (isSaved) {
      // Saved: must have a state entry with isSaved = true
      stateConditions.push(eq(userArticleStates.isSaved, true));
    } else {
      // Unsaved: either no state entry (NULL) or isSaved = false
      stateConditions.push(
        or(isNull(userArticleStates.id), eq(userArticleStates.isSaved, false)),
      );
    }
  }

  // If filtering by read/saved state, use LEFT JOIN
  if (isRead !== undefined || isSaved !== undefined) {
    // Get total count with LEFT JOIN
    const totalResult = await db
      .select({ count: sql<number>`count(DISTINCT ${articles.id})` })
      .from(articles)
      .leftJoin(
        userArticleStates,
        and(
          eq(userArticleStates.articleId, articles.id),
          eq(userArticleStates.userId, user.id),
        ),
      )
      .where(and(...articleConditions, ...stateConditions));

    const total = totalResult[0]?.count || 0;

    // Get articles with LEFT JOIN
    const articleResults = await db
      .select()
      .from(articles)
      .leftJoin(
        userArticleStates,
        and(
          eq(userArticleStates.articleId, articles.id),
          eq(userArticleStates.userId, user.id),
        ),
      )
      .where(and(...articleConditions, ...stateConditions))
      .groupBy(articles.id)
      .orderBy(desc(articles.date), desc(articles.id))
      .limit(pageSize)
      .offset(offset);

    // Extract articles from join results
    const articleList = articleResults.map((row) => row.articles);

    return { articles: articleList, total };
  }

  // No read/saved filtering - use simple query
  // Get total count
  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(articles)
    .where(and(...articleConditions));

  const total = totalResult[0]?.count || 0;

  // Get articles
  const articleList = await db
    .select()
    .from(articles)
    .where(and(...articleConditions))
    .orderBy(desc(articles.date), desc(articles.id))
    .limit(pageSize)
    .offset(offset);

  return { articles: articleList, total };
}

/**
 * Get article by ID.
 */
export async function getArticle(id: number, user: UserInfo): Promise<Article> {
  const [article] = await db
    .select()
    .from(articles)
    .where(eq(articles.id, id))
    .limit(1);

  if (!article) {
    throw new NotFoundError(`Article with id ${id} not found`);
  }

  // Check feed access
  const [feed] = await db
    .select()
    .from(feeds)
    .where(eq(feeds.id, article.feedId))
    .limit(1);

  if (!feed) {
    throw new NotFoundError("Feed not found");
  }

  if (feed.userId !== null && feed.userId !== user.id && !user.isSuperuser) {
    throw new PermissionDeniedError("You do not have access to this article");
  }

  return article;
}

/**
 * Update article content.
 */
export async function updateArticle(
  id: number,
  user: UserInfo,
  data: { content?: string },
): Promise<Article> {
  // First verify article exists and user has access
  const article = await getArticle(id, user);

  // Update article
  const [updated] = await db
    .update(articles)
    .set({
      content: data.content !== undefined ? data.content : article.content,
      updatedAt: new Date(),
    })
    .where(eq(articles.id, id))
    .returning();

  if (!updated) {
    throw new NotFoundError(`Article with id ${id} not found`);
  }

  logger.info({ articleId: id, userId: user.id }, "Article updated");
  return updated;
}

/**
 * Mark articles as read/unread.
 * Optimized with bulk database operations.
 */
export async function markArticlesRead(
  user: UserInfo,
  articleIds: number[],
  isRead: boolean,
): Promise<void> {
  if (articleIds.length === 0) {
    return;
  }

  // Batch verify user has access to all articles
  const accessibleArticles = await db
    .select({ id: articles.id })
    .from(articles)
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .where(
      and(
        inArray(articles.id, articleIds),
        or(eq(feeds.userId, user.id), isNull(feeds.userId)),
        eq(feeds.enabled, true),
      ),
    );

  const accessibleIds = new Set(accessibleArticles.map((a) => a.id));
  const invalidIds = articleIds.filter((id) => !accessibleIds.has(id));

  if (invalidIds.length > 0) {
    throw new PermissionDeniedError(
      `Access denied to ${invalidIds.length} article(s)`,
    );
  }

  if (accessibleIds.size === 0) {
    return;
  }

  const now = new Date();
  const accessibleIdsArray = Array.from(accessibleIds);

  // Get all existing states in one query
  const existingStates = await db
    .select()
    .from(userArticleStates)
    .where(
      and(
        eq(userArticleStates.userId, user.id),
        inArray(userArticleStates.articleId, accessibleIdsArray),
      ),
    );

  const existingStateMap = new Map(existingStates.map((s) => [s.articleId, s]));

  // Prepare bulk operations
  const toCreate: Array<{
    userId: number;
    articleId: number;
    isRead: boolean;
    isSaved: boolean;
    createdAt: Date;
    updatedAt: Date;
  }> = [];
  const toUpdate: number[] = [];

  for (const articleId of accessibleIdsArray) {
    const existing = existingStateMap.get(articleId);
    if (existing) {
      // Only update if the read state is different
      if (existing.isRead !== isRead) {
        toUpdate.push(existing.id);
      }
    } else {
      // Create new state
      toCreate.push({
        userId: user.id,
        articleId,
        isRead,
        isSaved: false,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // Execute bulk operations
  if (toCreate.length > 0) {
    await db.insert(userArticleStates).values(toCreate).onConflictDoNothing();
  }

  if (toUpdate.length > 0) {
    await db
      .update(userArticleStates)
      .set({ isRead, updatedAt: now })
      .where(inArray(userArticleStates.id, toUpdate));
  }

  // Invalidate cache
  const { cache } = await import("../utils/cache");
  cache.delete(`unread_counts_${user.id}_false`);
  cache.delete(`unread_counts_${user.id}_true`);

  logger.info(
    { userId: user.id, articleIds: accessibleIdsArray, isRead },
    "Articles marked as read/unread",
  );
}

/**
 * Mark articles as saved/unsaved.
 */
export async function markArticlesSaved(
  user: UserInfo,
  articleIds: number[],
  isSaved: boolean,
): Promise<void> {
  // Verify user has access to all articles
  for (const articleId of articleIds) {
    await getArticle(articleId, user);
  }

  // Update or create states
  for (const articleId of articleIds) {
    const [existing] = await db
      .select()
      .from(userArticleStates)
      .where(
        and(
          eq(userArticleStates.userId, user.id),
          eq(userArticleStates.articleId, articleId),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(userArticleStates)
        .set({ isSaved, updatedAt: new Date() })
        .where(
          and(
            eq(userArticleStates.userId, user.id),
            eq(userArticleStates.articleId, articleId),
          ),
        );
    } else {
      await db.insert(userArticleStates).values({
        userId: user.id,
        articleId,
        isRead: false,
        isSaved,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  logger.info(
    { userId: user.id, articleIds, isSaved },
    "Articles marked as saved/unsaved",
  );
}

/**
 * Delete article.
 */
export async function deleteArticle(id: number, user: UserInfo): Promise<void> {
  // Check access
  await getArticle(id, user);

  await db.delete(articles).where(eq(articles.id, id));

  logger.info({ articleId: id, userId: user.id }, "Article deleted");
}

/**
 * Delete multiple articles in bulk.
 * Optimized with batch access verification and single DELETE query.
 */
export async function deleteArticles(
  user: UserInfo,
  articleIds: number[],
): Promise<number> {
  if (articleIds.length === 0) {
    return 0;
  }

  // Batch verify user has access to all articles
  const accessibleArticles = await db
    .select({ id: articles.id })
    .from(articles)
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .where(
      and(
        inArray(articles.id, articleIds),
        or(eq(feeds.userId, user.id), isNull(feeds.userId)),
        eq(feeds.enabled, true),
      ),
    );

  const accessibleIds = accessibleArticles.map((a) => a.id);

  if (accessibleIds.length === 0) {
    return 0;
  }

  // Delete all accessible articles in one query
  await db.delete(articles).where(inArray(articles.id, accessibleIds));

  logger.info(
    { userId: user.id, articleIds: accessibleIds, count: accessibleIds.length },
    "Articles deleted in bulk",
  );

  return accessibleIds.length;
}

/**
 * Reload article (trigger re-aggregation).
 */
export async function reloadArticle(
  id: number,
  user: UserInfo,
): Promise<{ success: boolean; taskId: number }> {
  // Check access
  await getArticle(id, user);

  const { reloadArticle: reloadArticleTask } =
    await import("./aggregation.service");
  const result = await reloadArticleTask(id);

  logger.info(
    { articleId: id, userId: user.id, taskId: result.taskId },
    "Article reload enqueued",
  );
  return { success: true, taskId: result.taskId };
}

/**
 * Reload multiple articles in bulk (trigger re-aggregation).
 * Optimized with batch access verification and parallel task queuing.
 */
export async function reloadArticles(
  user: UserInfo,
  articleIds: number[],
): Promise<{ success: boolean; taskIds: number[]; count: number }> {
  if (articleIds.length === 0) {
    return { success: true, taskIds: [], count: 0 };
  }

  // Batch verify user has access to all articles
  const accessibleArticles = await db
    .select({ id: articles.id })
    .from(articles)
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .where(
      and(
        inArray(articles.id, articleIds),
        or(eq(feeds.userId, user.id), isNull(feeds.userId)),
        eq(feeds.enabled, true),
      ),
    );

  const accessibleIds = accessibleArticles.map((a) => a.id);

  if (accessibleIds.length === 0) {
    return { success: true, taskIds: [], count: 0 };
  }

  // Queue all reload tasks using bulk insert for better performance
  // This is much faster than calling enqueueTask individually for each article
  // Instead of N individual INSERT queries, we do one bulk INSERT
  const { tasks } = await import("@server/db");
  const { getEventEmitter } = await import("./eventEmitter.service");
  const now = new Date();

  // Bulk insert all tasks at once
  const taskValues = accessibleIds.map((articleId) => ({
    type: "aggregate_article" as const,
    status: "pending" as const,
    payload: JSON.stringify({ articleId }),
    retries: 0,
    maxRetries: 3,
    createdAt: now,
    updatedAt: now,
  }));

  const createdTasks = await db.insert(tasks).values(taskValues).returning();

  const taskIds = createdTasks.map((t) => t.id);

  // Emit events for real-time updates
  const eventEmitter = getEventEmitter();
  for (const task of createdTasks) {
    eventEmitter.emit("task-created", {
      taskId: task.id,
      type: task.type,
      status: task.status,
    });
  }

  // Note: If DISABLE_WORKERS=true, tasks will be processed synchronously
  // by the worker process, not here. This keeps the code simpler and
  // maintains separation of concerns.

  logger.info(
    {
      userId: user.id,
      articleIds: accessibleIds,
      taskIds,
      count: accessibleIds.length,
    },
    "Articles reload enqueued in bulk",
  );

  return { success: true, taskIds, count: accessibleIds.length };
}

/**
 * Get article navigation (prev/next).
 */
export async function getArticleNavigation(
  article: Article,
  user: UserInfo,
): Promise<{ prev: Article | null; next: Article | null }> {
  // Ensure date is a Date object (Drizzle timestamp mode expects Date for comparisons)
  const articleDate =
    article.date instanceof Date ? article.date : new Date(article.date);

  // Get previous article (older)
  // Use date DESC, then id DESC as tiebreaker to ensure deterministic ordering
  const [prev] = await db
    .select()
    .from(articles)
    .where(
      and(
        eq(articles.feedId, article.feedId),
        or(
          lt(articles.date, articleDate),
          and(eq(articles.date, articleDate), lt(articles.id, article.id)),
        ),
      ),
    )
    .orderBy(desc(articles.date), desc(articles.id))
    .limit(1);

  // Get next article (newer)
  // Use date ASC, then id ASC as tiebreaker to ensure deterministic ordering
  const [next] = await db
    .select()
    .from(articles)
    .where(
      and(
        eq(articles.feedId, article.feedId),
        or(
          gt(articles.date, articleDate),
          and(eq(articles.date, articleDate), gt(articles.id, article.id)),
        ),
      ),
    )
    .orderBy(asc(articles.date), asc(articles.id))
    .limit(1);

  return { prev: prev || null, next: next || null };
}

/**
 * Mark an article as read when viewed.
 */
export async function markArticleReadOnView(
  articleId: number,
  user: UserInfo,
): Promise<void> {
  // Check access first
  await getArticle(articleId, user);

  // Update or create state
  const [existing] = await db
    .select()
    .from(userArticleStates)
    .where(
      and(
        eq(userArticleStates.userId, user.id),
        eq(userArticleStates.articleId, articleId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(userArticleStates)
      .set({ isRead: true, updatedAt: new Date() })
      .where(
        and(
          eq(userArticleStates.userId, user.id),
          eq(userArticleStates.articleId, articleId),
        ),
      );
  } else {
    await db.insert(userArticleStates).values({
      userId: user.id,
      articleId,
      isRead: true,
      isSaved: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // Invalidate statistics cache
  const { cache } = await import("../utils/cache");
  cache.delete(`statistics_${user.id}`);
}

/**
 * Get article read state (is_read, is_saved).
 */
export async function getArticleReadState(
  articleId: number,
  user: UserInfo,
): Promise<{ isRead: boolean; isSaved: boolean }> {
  const [state] = await db
    .select()
    .from(userArticleStates)
    .where(
      and(
        eq(userArticleStates.userId, user.id),
        eq(userArticleStates.articleId, articleId),
      ),
    )
    .limit(1);

  return {
    isRead: state?.isRead ?? false,
    isSaved: state?.isSaved ?? false,
  };
}

/**
 * Get accessible article IDs based on filters (reusable helper).
 * Optimized for performance with proper index usage.
 *
 * Indexes used:
 * - articles_feed_date_idx: (feed_id, date) - for feed and date filtering
 * - articles_feed_id_idx: (feed_id) - for feed filtering
 * - articles_date_idx: (date) - for date range filtering
 * - user_article_states_user_read_idx: (user_id, is_read) - for read state filtering
 * - user_article_states_user_saved_idx: (user_id, is_saved) - for saved state filtering
 */
async function getAccessibleArticleIds(
  user: UserInfo,
  filters: {
    feedId?: number;
    groupId?: number;
    isRead?: boolean;
    isSaved?: boolean;
    search?: string;
    dateFrom?: Date | string;
    dateTo?: Date | string;
  },
): Promise<number[]> {
  // Build feed conditions (same logic as listArticles)
  // Uses feeds_user_id_idx index
  const feedConditions = [or(eq(feeds.userId, user.id), isNull(feeds.userId))];

  if (filters.feedId) {
    feedConditions.push(eq(feeds.id, filters.feedId));
  }

  let accessibleFeeds = await db
    .select({ id: feeds.id })
    .from(feeds)
    .where(and(...feedConditions));

  // Filter by group if specified
  // Uses feed_groups_group_id_idx index
  if (filters.groupId) {
    const [group] = await db
      .select()
      .from(groups)
      .where(
        and(
          eq(groups.id, filters.groupId),
          or(eq(groups.userId, user.id), isNull(groups.userId)),
        ),
      )
      .limit(1);

    if (!group) {
      return [];
    }

    const feedIdsInGroup = await db
      .select({ feedId: feedGroups.feedId })
      .from(feedGroups)
      .where(eq(feedGroups.groupId, filters.groupId));

    const groupFeedIds = new Set(feedIdsInGroup.map((f) => f.feedId));
    accessibleFeeds = accessibleFeeds.filter((f) => groupFeedIds.has(f.id));
  }

  const feedIds = accessibleFeeds.map((f) => f.id);
  if (feedIds.length === 0) {
    return [];
  }

  // Build article conditions
  // Use inArray for feed filtering - leverages articles_feed_id_idx
  const articleConditions = [inArray(articles.feedId, feedIds)];

  // Search uses LIKE which can't use index efficiently, but it's necessary
  if (filters.search) {
    articleConditions.push(like(articles.name, `%${filters.search}%`));
  }

  // Date filtering uses articles_feed_date_idx or articles_date_idx
  if (filters.dateFrom) {
    const fromDate =
      filters.dateFrom instanceof Date
        ? filters.dateFrom
        : new Date(filters.dateFrom);
    articleConditions.push(gte(articles.date, fromDate));
  }

  if (filters.dateTo) {
    const toDate =
      filters.dateTo instanceof Date
        ? filters.dateTo
        : new Date(filters.dateTo);
    toDate.setHours(23, 59, 59, 999);
    articleConditions.push(lte(articles.date, toDate));
  }

  // Handle read/saved state filtering
  if (filters.isRead !== undefined || filters.isSaved !== undefined) {
    const stateConditions: ReturnType<typeof and>[] = [];

    if (filters.isRead !== undefined) {
      if (filters.isRead) {
        stateConditions.push(eq(userArticleStates.isRead, true));
      } else {
        stateConditions.push(
          or(isNull(userArticleStates.id), eq(userArticleStates.isRead, false)),
        );
      }
    }

    if (filters.isSaved !== undefined) {
      if (filters.isSaved) {
        stateConditions.push(eq(userArticleStates.isSaved, true));
      } else {
        stateConditions.push(
          or(
            isNull(userArticleStates.id),
            eq(userArticleStates.isSaved, false),
          ),
        );
      }
    }

    // Get article IDs with LEFT JOIN
    const articleResults = await db
      .select({ id: articles.id })
      .from(articles)
      .leftJoin(
        userArticleStates,
        and(
          eq(userArticleStates.articleId, articles.id),
          eq(userArticleStates.userId, user.id),
        ),
      )
      .where(and(...articleConditions, ...stateConditions))
      .groupBy(articles.id);

    return articleResults.map((row) => row.id);
  }

  // No read/saved filtering - simple query
  const articleResults = await db
    .select({ id: articles.id })
    .from(articles)
    .where(and(...articleConditions));

  return articleResults.map((row) => row.id);
}

/**
 * Mark all filtered articles as read/unread.
 * Uses filters directly instead of fetching IDs first.
 */
export async function markFilteredRead(
  user: UserInfo,
  filters: {
    feedId?: number;
    groupId?: number;
    isRead?: boolean;
    isSaved?: boolean;
    search?: string;
    dateFrom?: Date | string;
    dateTo?: Date | string;
  },
  isRead: boolean,
): Promise<number> {
  const articleIds = await getAccessibleArticleIds(user, filters);

  if (articleIds.length === 0) {
    return 0;
  }

  // Use optimized bulk mark function
  await markArticlesRead(user, articleIds, isRead);

  return articleIds.length;
}

/**
 * Delete all filtered articles.
 * Uses filters directly instead of fetching IDs first.
 */
export async function deleteFiltered(
  user: UserInfo,
  filters: {
    feedId?: number;
    groupId?: number;
    isRead?: boolean;
    isSaved?: boolean;
    search?: string;
    dateFrom?: Date | string;
    dateTo?: Date | string;
  },
): Promise<number> {
  const articleIds = await getAccessibleArticleIds(user, filters);

  if (articleIds.length === 0) {
    return 0;
  }

  // Use optimized bulk delete function
  return await deleteArticles(user, articleIds);
}

/**
 * Refresh all filtered articles.
 * Uses filters directly instead of fetching IDs first.
 */
export async function refreshFiltered(
  user: UserInfo,
  filters: {
    feedId?: number;
    groupId?: number;
    isRead?: boolean;
    isSaved?: boolean;
    search?: string;
    dateFrom?: Date | string;
    dateTo?: Date | string;
  },
): Promise<{ taskIds: number[]; count: number }> {
  const articleIds = await getAccessibleArticleIds(user, filters);

  if (articleIds.length === 0) {
    return { taskIds: [], count: 0 };
  }

  // Use optimized bulk reload function
  const result = await reloadArticles(user, articleIds);
  return { taskIds: result.taskIds, count: result.count };
}

/**
 * Enrich article data with computed fields and read state.
 */
export async function enrichArticleData(
  article: Article,
  user: UserInfo,
): Promise<{
  isRead: boolean;
  isSaved: boolean;
  isVideo: boolean;
  isPodcast: boolean;
  isReddit: boolean;
  hasMedia: boolean;
  durationFormatted: string | null;
}> {
  const readState = await getArticleReadState(article.id, user);

  // Fetch feed to get feedType
  const [feed] = await db
    .select({ feedType: feeds.feedType })
    .from(feeds)
    .where(eq(feeds.id, article.feedId))
    .limit(1);
  const feedType = feed?.feedType || "article";

  // Compute fields based on feed type
  const isVideo = feedType === "youtube";
  const isPodcast = feedType === "podcast";
  const isReddit = feedType === "reddit";
  const hasMedia = !!(article.mediaUrl || article.thumbnailUrl);

  // Format duration if available
  let durationFormatted: string | null = null;
  if (article.duration) {
    const hours = Math.floor(article.duration / 3600);
    const minutes = Math.floor((article.duration % 3600) / 60);
    const seconds = article.duration % 60;

    if (hours > 0) {
      durationFormatted = `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    } else {
      durationFormatted = `${minutes}:${seconds.toString().padStart(2, "0")}`;
    }
  }

  return {
    ...readState,
    isVideo,
    isPodcast,
    isReddit,
    hasMedia,
    durationFormatted,
  };
}
