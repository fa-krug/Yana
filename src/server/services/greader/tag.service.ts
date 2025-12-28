/**
 * Google Reader API tag service.
 */

import { eq, and, or, isNull, inArray, lt } from "drizzle-orm";

import {
  db,
  articles,
  feeds,
  userArticleStates,
  groups,
} from "@server/db";
import { cache } from "@server/utils/cache";

import { StreamFilterOrchestrator } from "./stream-filter-builder";

const STATE_READ = "user/-/state/com.google/read";
const STATE_STARRED = "user/-/state/com.google/starred";
const STATE_READING_LIST = "user/-/state/com.google/reading-list";
const STATE_KEPT_UNREAD = "user/-/state/com.google/kept-unread";

/**
 * List tags for a user.
 */
export async function listTags(userId: number): Promise<Array<{ id: string }>> {
  const tags = [
    { id: STATE_STARRED },
    { id: STATE_READ },
    { id: STATE_READING_LIST },
    { id: STATE_KEPT_UNREAD },
  ];

  // Get user's groups
  const userGroups = await db
    .select({ name: groups.name })
    .from(groups)
    .where(or(eq(groups.userId, userId), isNull(groups.userId)));

  for (const group of userGroups) {
    tags.push({ id: `user/-/label/${group.name}` });
  }

  return tags;
}

/**
 * Determine state updates based on tags.
 */
function getTagUpdates(addTag: string, removeTag: string): { isRead?: boolean; isSaved?: boolean } {
  const updates: { isRead?: boolean; isSaved?: boolean } = {};
  if (addTag === STATE_READ) updates.isRead = true;
  else if (addTag === STATE_STARRED) updates.isSaved = true;
  if (removeTag === STATE_READ) updates.isRead = false;
  else if (removeTag === STATE_STARRED) updates.isSaved = false;
  return updates;
}

/**
 * Edit tags (mark as read/starred).
 */
export async function editTags(
  userId: number,
  itemIds: string[],
  addTag: string,
  removeTag: string,
): Promise<number> {
  if (!itemIds?.length) return 0;

  const articleIds = itemIds.map((id) => parseItemId(id)).filter((id) => id > 0);
  if (!articleIds.length) return 0;

  const accessibleArticles = await db.select({ id: articles.id }).from(articles).innerJoin(feeds, eq(articles.feedId, feeds.id))
    .where(and(inArray(articles.id, articleIds), or(eq(feeds.userId, userId), isNull(feeds.userId)), eq(feeds.enabled, true)));

  const accessibleIds = accessibleArticles.map((a) => a.id);
  if (!accessibleIds.length) return 0;

  const updates = getTagUpdates(addTag, removeTag);
  if (!Object.keys(updates).length) return 0;

  const existingStates = await db.select().from(userArticleStates).where(and(eq(userArticleStates.userId, userId), inArray(userArticleStates.articleId, accessibleIds)));
  const stateMap = new Map(existingStates.map((s) => [s.articleId, s]));

  const toCreate: (typeof userArticleStates.$inferInsert)[] = [];
  const toUpdate: Array<{ id: number; isRead: boolean; isSaved: boolean; updatedAt: Date }> = [];
  const toDelete: number[] = [];

  for (const articleId of accessibleIds) {
    const existing = stateMap.get(articleId);
    const newRead = updates.isRead !== undefined ? updates.isRead : (existing?.isRead ?? false);
    const newSaved = updates.isSaved !== undefined ? updates.isSaved : (existing?.isSaved ?? false);

    if (existing) {
      if (!newRead && !newSaved) toDelete.push(existing.id);
      else toUpdate.push({ id: existing.id, isRead: newRead, isSaved: newSaved, updatedAt: new Date() });
    } else if (newRead || newSaved) {
      toCreate.push({ userId, articleId, isRead: newRead, isSaved: newSaved, createdAt: new Date(), updatedAt: new Date() });
    }
  }

  if (toCreate.length) await db.insert(userArticleStates).values(toCreate).onConflictDoNothing();
  for (const u of toUpdate) await db.update(userArticleStates).set({ isRead: u.isRead, isSaved: u.isSaved, updatedAt: u.updatedAt }).where(eq(userArticleStates.id, u.id));
  if (toDelete.length) await db.delete(userArticleStates).where(inArray(userArticleStates.id, toDelete));

  cache.delete(`unread_counts_${userId}_false`);
  cache.delete(`unread_counts_${userId}_true`);
  return toCreate.length + toUpdate.length + toDelete.length;
}

/**
 * Categorize article IDs into create/update batch operations.
 */
function categorizeBatchOperations(
  articleIds: number[],
  existingStates: typeof userArticleStates.$inferSelect[],
  userId: number,
): {
  toCreate: (typeof userArticleStates.$inferInsert)[];
  toUpdate: number[];
} {
  const existingIds = new Set(existingStates.map((s) => s.articleId));
  const toCreate = articleIds
    .filter((id) => !existingIds.has(id))
    .map((id) => ({
      userId,
      articleId: id,
      isRead: true,
      isSaved: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

  const toUpdate = existingStates.filter((s) => !s.isRead).map((s) => s.id);

  return { toCreate, toUpdate };
}

/**
 * Mark all as read.
 */
export async function markAllAsRead(
  userId: number,
  streamId: string,
  timestamp: string,
): Promise<number> {
  if (!streamId) {
    return 0;
  }

  // Parse timestamp if provided
  let timestampDate: Date | null = null;
  if (timestamp) {
    const ts = parseInt(timestamp, 10);
    if (!isNaN(ts)) {
      timestampDate = new Date(ts * 1000);
    }
  }

  // Build stream filter conditions
  const orchestrator = new StreamFilterOrchestrator();
  const filterResult = await orchestrator.buildQuery(streamId, userId);

  // Add timestamp filter if provided
  const conditions = [...filterResult.conditions];
  if (timestampDate) {
    conditions.push(lt(articles.date, timestampDate));
  }

  // Build query with all conditions
  const baseQuery = db.select({ id: articles.id }).from(articles);

  const articleQuery = filterResult.needsFeedJoin
    ? baseQuery
        .innerJoin(feeds, eq(articles.feedId, feeds.id))
        .where(and(...conditions))
    : baseQuery.where(and(...conditions));

  const articleIds = await articleQuery;
  const ids = articleIds.map((a) => a.id);

  if (ids.length === 0) {
    return 0;
  }

  // Get existing states
  const existingStates = await db
    .select()
    .from(userArticleStates)
    .where(
      and(
        eq(userArticleStates.userId, userId),
        inArray(userArticleStates.articleId, ids),
      ),
    );

  // Categorize into create/update operations
  const { toCreate, toUpdate } = categorizeBatchOperations(
    ids,
    existingStates,
    userId,
  );

  // Execute batch operations
  if (toCreate.length > 0) {
    await db.insert(userArticleStates).values(toCreate).onConflictDoNothing();
  }

  if (toUpdate.length > 0) {
    await db
      .update(userArticleStates)
      .set({ isRead: true, updatedAt: new Date() })
      .where(inArray(userArticleStates.id, toUpdate));
  }

  // Invalidate cache
  cache.delete(`unread_counts_${userId}_false`);
  cache.delete(`unread_counts_${userId}_true`);

  return toCreate.length + toUpdate.length;
}

/**
 * Parse item ID from various formats.
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
