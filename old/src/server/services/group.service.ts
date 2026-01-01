/**
 * Group service.
 *
 * Handles feed group management operations.
 */

import { eq, and, isNull, inArray, ne, or } from "drizzle-orm";

import { db, groups, feedGroups, feeds } from "../db";
import type { Group } from "../db/types";
import { NotFoundError, PermissionDeniedError, ConflictError } from "../errors";
import { logger } from "../utils/logger";

/**
 * Minimal user info needed for group operations.
 */
type _UserInfo = Pick<
  { id: number; isSuperuser: boolean },
  "id" | "isSuperuser"
>;

/**
 * List groups for a user (own groups + shared groups).
 */
export async function listGroups(userId: number): Promise<Group[]> {
  const groupList = await db
    .select()
    .from(groups)
    .where(or(eq(groups.userId, userId), isNull(groups.userId)))
    .orderBy(groups.name);

  return groupList;
}

/**
 * Get group by ID.
 */
export async function getGroup(id: number, userId: number): Promise<Group> {
  const [group] = await db
    .select()
    .from(groups)
    .where(
      and(
        eq(groups.id, id),
        or(eq(groups.userId, userId), isNull(groups.userId)),
      ),
    )
    .limit(1);

  if (!group) {
    throw new NotFoundError(`Group with id ${id} not found`);
  }

  return group;
}

/**
 * Create a new group.
 */
export async function createGroup(
  userId: number,
  name: string,
): Promise<Group> {
  // Check if group with same name already exists for this user
  const existing = await db
    .select()
    .from(groups)
    .where(
      and(
        eq(groups.name, name),
        or(eq(groups.userId, userId), isNull(groups.userId)),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    throw new ConflictError(
      `Group with name '${name}' already exists for this user`,
    );
  }

  const [newGroup] = await db
    .insert(groups)
    .values({
      name,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  logger.info({ groupId: newGroup.id, userId, name }, "Group created");

  return newGroup;
}

/**
 * Update group.
 */
export async function updateGroup(
  id: number,
  userId: number,
  name: string,
): Promise<Group> {
  // Check access
  const existingGroup = await getGroup(id, userId);

  // Check if another group with same name exists
  const existing = await db
    .select()
    .from(groups)
    .where(
      and(
        eq(groups.name, name),
        or(eq(groups.userId, userId), isNull(groups.userId)),
        // Exclude current group
        ne(groups.id, id),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    throw new ConflictError(
      `Group with name '${name}' already exists for this user`,
    );
  }

  // Only allow updating own groups (not shared groups)
  if (existingGroup.userId !== userId) {
    throw new PermissionDeniedError(
      "Cannot update shared groups (groups without user_id)",
    );
  }

  const [updated] = await db
    .update(groups)
    .set({ name, updatedAt: new Date() })
    .where(eq(groups.id, id))
    .returning();

  if (!updated) {
    throw new NotFoundError(`Group with id ${id} not found`);
  }

  logger.info({ groupId: id, userId, name }, "Group updated");

  return updated;
}

/**
 * Delete group.
 */
export async function deleteGroup(id: number, userId: number): Promise<void> {
  // Check access
  const existingGroup = await getGroup(id, userId);

  // Only allow deleting own groups (not shared groups)
  if (existingGroup.userId !== userId) {
    throw new PermissionDeniedError(
      "Cannot delete shared groups (groups without user_id)",
    );
  }

  // Delete feed-group relationships (cascade should handle this, but explicit is better)
  await db.delete(feedGroups).where(eq(feedGroups.groupId, id));

  // Delete group
  await db.delete(groups).where(eq(groups.id, id));

  logger.info({ groupId: id, userId }, "Group deleted");
}

/**
 * Get groups for a feed.
 */
export async function getFeedGroups(
  feedId: number,
  userId: number,
): Promise<Group[]> {
  // First verify feed access
  const [feed] = await db
    .select()
    .from(feeds)
    .where(
      and(
        eq(feeds.id, feedId),
        or(eq(feeds.userId, userId), isNull(feeds.userId)),
      ),
    )
    .limit(1);

  if (!feed) {
    throw new NotFoundError(`Feed with id ${feedId} not found`);
  }

  // Get groups for this feed
  const feedGroupList = await db
    .select({
      id: groups.id,
      name: groups.name,
      userId: groups.userId,
      createdAt: groups.createdAt,
      updatedAt: groups.updatedAt,
    })
    .from(feedGroups)
    .innerJoin(groups, eq(feedGroups.groupId, groups.id))
    .where(
      and(
        eq(feedGroups.feedId, feedId),
        or(eq(groups.userId, userId), isNull(groups.userId)),
      ),
    );

  return feedGroupList;
}

/**
 * Set groups for a feed (replaces existing groups).
 */
export async function setFeedGroups(
  feedId: number,
  userId: number,
  groupIds: number[],
): Promise<Group[]> {
  // First verify feed access
  const [feed] = await db
    .select()
    .from(feeds)
    .where(
      and(
        eq(feeds.id, feedId),
        or(eq(feeds.userId, userId), isNull(feeds.userId)),
      ),
    )
    .limit(1);

  if (!feed) {
    throw new NotFoundError(`Feed with id ${feedId} not found`);
  }

  // Only allow updating own feeds
  if (feed.userId !== userId && feed.userId !== null) {
    throw new PermissionDeniedError("Cannot modify groups for shared feeds");
  }

  // Verify all groups exist and user has access
  if (groupIds.length > 0) {
    const accessibleGroups = await db
      .select()
      .from(groups)
      .where(
        and(
          inArray(groups.id, groupIds),
          or(eq(groups.userId, userId), isNull(groups.userId)),
        ),
      );

    if (accessibleGroups.length !== groupIds.length) {
      throw new NotFoundError("One or more groups not found or not accessible");
    }
  }

  // Delete existing feed-group relationships
  await db.delete(feedGroups).where(eq(feedGroups.feedId, feedId));

  // Create new feed-group relationships
  if (groupIds.length > 0) {
    await db.insert(feedGroups).values(
      groupIds.map((groupId) => ({
        feedId,
        groupId,
      })),
    );
  }

  logger.info(
    { feedId, userId, groupIds, count: groupIds.length },
    "Feed groups updated",
  );

  // Return updated groups
  return getFeedGroups(feedId, userId);
}
