/**
 * Google Reader API subscription service.
 */

import { eq, and, or, isNull, inArray } from 'drizzle-orm';
import { db, feeds, groups, feedGroups } from '../../db';
import { NotFoundError, PermissionDeniedError, ValidationError } from '../../errors';
import { logger } from '../../utils/logger';

/**
 * List subscriptions for a user.
 */
export async function listSubscriptions(userId: number): Promise<
  Array<{
    id: string;
    title: string;
    categories: Array<{ id: string; label: string }>;
    url: string;
    htmlUrl: string;
    iconUrl: string;
  }>
> {
  // Get user's feeds (own feeds + shared feeds)
  const userFeeds = await db
    .select()
    .from(feeds)
    .where(and(or(eq(feeds.userId, userId), isNull(feeds.userId)), eq(feeds.enabled, true)));

  // Get feed groups
  const feedIds = userFeeds.map(f => f.id);
  const feedGroupRelations =
    feedIds.length > 0
      ? await db
          .select({
            feedId: feedGroups.feedId,
            groupId: feedGroups.groupId,
            groupName: groups.name,
          })
          .from(feedGroups)
          .innerJoin(groups, eq(feedGroups.groupId, groups.id))
          .where(
            and(
              inArray(feedGroups.feedId, feedIds),
              or(eq(groups.userId, userId), isNull(groups.userId))
            )
          )
      : [];

  // Build group map
  const feedGroupsMap = new Map<number, Array<{ id: string; label: string }>>();
  for (const rel of feedGroupRelations) {
    if (!feedGroupsMap.has(rel.feedId)) {
      feedGroupsMap.set(rel.feedId, []);
    }
    feedGroupsMap.get(rel.feedId)!.push({
      id: `user/-/label/${rel.groupName}`,
      label: rel.groupName,
    });
  }

  // Build subscriptions
  const subscriptions = userFeeds.map(feed => ({
    id: `feed/${feed.id}`,
    title: feed.name,
    categories: feedGroupsMap.get(feed.id) || [],
    url: feed.identifier,
    htmlUrl: getSiteUrl(feed),
    iconUrl: feed.icon || getFeedIcon(feed),
  }));

  return subscriptions;
}

/**
 * Edit subscription.
 */
export async function editSubscription(
  userId: number,
  options: {
    streamId: string;
    action: string;
    newTitle: string;
    addLabel: string;
    removeLabel: string;
  }
): Promise<void> {
  const { streamId, action, newTitle, addLabel, removeLabel } = options;

  if (!streamId) {
    throw new ValidationError('Missing stream ID');
  }

  if (!streamId.startsWith('feed/')) {
    throw new ValidationError('Invalid stream ID');
  }

  const feedId = parseInt(streamId.slice(5), 10);
  if (isNaN(feedId)) {
    throw new ValidationError('Invalid stream ID');
  }

  // Get feed
  const [feed] = await db
    .select()
    .from(feeds)
    .where(and(or(eq(feeds.userId, userId), isNull(feeds.userId)), eq(feeds.id, feedId)))
    .limit(1);

  if (!feed) {
    throw new NotFoundError('Feed not found');
  }

  if (action === 'unsubscribe') {
    if (feed.userId === userId) {
      await db.delete(feeds).where(eq(feeds.id, feedId));
      logger.info({ userId, feedId }, 'User unsubscribed from feed');
    } else {
      throw new PermissionDeniedError('Cannot unsubscribe from shared feed');
    }
  } else {
    // Update title
    if (newTitle && feed.userId === userId) {
      await db
        .update(feeds)
        .set({ name: newTitle, updatedAt: new Date() })
        .where(eq(feeds.id, feedId));
    }

    // Add label
    if (addLabel.startsWith('user/-/label/')) {
      const labelName = addLabel.slice(13);
      // Get or create group
      let [group] = await db
        .select()
        .from(groups)
        .where(
          and(eq(groups.name, labelName), or(eq(groups.userId, userId), isNull(groups.userId)))
        )
        .limit(1);

      if (!group) {
        const [newGroup] = await db
          .insert(groups)
          .values({
            name: labelName,
            userId,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();
        group = newGroup;
      }

      // Add feed to group
      await db
        .insert(feedGroups)
        .values({
          feedId,
          groupId: group.id,
        })
        .onConflictDoNothing();
    }

    // Remove label
    if (removeLabel.startsWith('user/-/label/')) {
      const labelName = removeLabel.slice(13);
      const [group] = await db
        .select({ id: groups.id })
        .from(groups)
        .where(
          and(eq(groups.name, labelName), or(eq(groups.userId, userId), isNull(groups.userId)))
        )
        .limit(1);

      if (group) {
        await db
          .delete(feedGroups)
          .where(and(eq(feedGroups.feedId, feedId), eq(feedGroups.groupId, group.id)));
      }
    }
  }
}

/**
 * Get site URL for a feed.
 */
function getSiteUrl(feed: { identifier: string; feedType: string }): string {
  if (feed.feedType === 'reddit') {
    const subreddit = feed.identifier.replace(/^r\//, '');
    return `https://www.reddit.com/r/${subreddit}`;
  }

  if (feed.feedType === 'youtube') {
    const identifier = feed.identifier;
    if (identifier.startsWith('UC') && identifier.length >= 24) {
      return `https://www.youtube.com/channel/${identifier}`;
    } else if (identifier.startsWith('@')) {
      return `https://www.youtube.com/${identifier}`;
    }
    return 'https://www.youtube.com';
  }

  // For regular RSS feeds, extract base URL
  if (feed.identifier.startsWith('http://') || feed.identifier.startsWith('https://')) {
    try {
      const url = new URL(feed.identifier);
      return `${url.protocol}//${url.host}`;
    } catch {
      return feed.identifier;
    }
  }

  return feed.identifier;
}

/**
 * Get feed icon URL.
 */
function getFeedIcon(feed: { feedType: string }): string {
  if (feed.feedType === 'youtube') {
    return 'https://www.youtube.com/s/desktop/favicon.ico';
  } else if (feed.feedType === 'reddit') {
    return 'https://www.reddit.com/favicon.ico';
  }
  return '';
}
