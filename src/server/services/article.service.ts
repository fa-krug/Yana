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
  sql,
  like,
  inArray,
  lt,
  gt,
} from "drizzle-orm";
import { db, articles, feeds, userArticleStates } from "../db";
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
    isRead?: boolean;
    isSaved?: boolean;
    search?: string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<{ articles: Article[]; total: number }> {
  const {
    feedId,
    feedType,
    isRead,
    isSaved,
    search,
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
  const accessibleFeeds = await db
    .select({ id: feeds.id })
    .from(feeds)
    .where(and(...feedConditions));

  const feedIds = accessibleFeeds.map((f) => f.id);

  if (feedIds.length === 0) {
    return { articles: [], total: 0 };
  }

  // Build article conditions
  const articleConditions = [inArray(articles.feedId, feedIds)];

  if (search) {
    articleConditions.push(like(articles.name, `%${search}%`));
  }

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
    .orderBy(desc(articles.date))
    .limit(pageSize)
    .offset(offset);

  // Filter by read/saved state if needed
  let filteredArticles = articleList;

  if (isRead !== undefined || isSaved !== undefined) {
    const articleIds = articleList.map((a) => a.id);
    const states = await db
      .select()
      .from(userArticleStates)
      .where(
        and(
          eq(userArticleStates.userId, user.id),
          inArray(userArticleStates.articleId, articleIds),
        ),
      );

    const stateMap = new Map(
      states.map((s) => [
        s.articleId,
        { isRead: s.isRead, isSaved: s.isSaved },
      ]),
    );

    filteredArticles = articleList.filter((article) => {
      const state = stateMap.get(article.id);
      if (isRead !== undefined) {
        if (state?.isRead !== isRead) return false;
      }
      if (isSaved !== undefined) {
        if (state?.isSaved !== isSaved) return false;
      }
      return true;
    });
  }

  return { articles: filteredArticles, total };
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
 * Mark articles as read/unread.
 */
export async function markArticlesRead(
  user: UserInfo,
  articleIds: number[],
  isRead: boolean,
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
        .set({ isRead, updatedAt: new Date() })
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
        isRead,
        isSaved: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  logger.info(
    { userId: user.id, articleIds, isRead },
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
  const [prev] = await db
    .select()
    .from(articles)
    .where(
      and(eq(articles.feedId, article.feedId), lt(articles.date, articleDate)),
    )
    .orderBy(desc(articles.date))
    .limit(1);

  // Get next article (newer)
  const [next] = await db
    .select()
    .from(articles)
    .where(
      and(eq(articles.feedId, article.feedId), gt(articles.date, articleDate)),
    )
    .orderBy(articles.date)
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
