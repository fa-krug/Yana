/**
 * Feed CRUD service - handles feed create, update, delete operations.
 */

import { eq } from "drizzle-orm";

import { getAggregatorById } from "../aggregators/registry";
import { db, feeds, articles } from "../db";
import type { Feed, FeedInsert, User } from "../db/types";
import { logger } from "../utils/logger";

import { getAggregatorMetadataById } from "./aggregator.service";
import { getFeed } from "./feed-query.service";
import { setFeedGroups } from "./group.service";

/**
 * Minimal user info needed for feed operations.
 */
type UserInfo = Pick<User, "id" | "isSuperuser">;

/**
 * Filter out restricted aggregator options.
 */
function filterAggregatorOptions(options: Record<string, unknown>): Record<string, unknown> {
  const restrictedOptions = [
    "exclude_selectors",
    "ignore_content_contains",
    "ignore_title_contains",
    "regex_replacements",
  ];
  const filteredOptions: Record<string, unknown> = {};
  Object.entries(options).forEach(([key, value]) => {
    if (!restrictedOptions.includes(key)) {
      filteredOptions[key] = value;
    }
  });
  return filteredOptions;
}

/**
 * Filter out restricted options and AI features for managed aggregators.
 * Returns only the fields that should be filtered, not the entire data object.
 */
function filterManagedFeedData(
  data: Partial<FeedInsert>,
  aggregatorId?: string,
): {
  aggregatorOptions?: Record<string, unknown>;
  aiTranslateTo?: string;
  aiSummarize?: boolean;
  aiCustomPrompt?: string;
} {
  if (!aggregatorId) return {};

  try {
    const aggregatorMetadata = getAggregatorMetadataById(aggregatorId);
    if (aggregatorMetadata.type !== "managed") return {};

    const filtered: {
      aggregatorOptions?: Record<string, unknown>;
      aiTranslateTo?: string;
      aiSummarize?: boolean;
      aiCustomPrompt?: string;
    } = {
      aiTranslateTo: "",
      aiSummarize: false,
      aiCustomPrompt: "",
    };

    // Filter out restricted aggregator options
    if (data.aggregatorOptions !== undefined && data.aggregatorOptions !== null) {
      filtered.aggregatorOptions = filterAggregatorOptions(data.aggregatorOptions as Record<string, unknown>);
    }

    return filtered;
  } catch (error) {
    logger.warn({ error, aggregator: aggregatorId }, "Failed to get aggregator metadata for filtering");
    return {};
  }
}

/**
 * Get aggregator-specific default for dailyPostLimit.
 */
function getDefaultDailyLimit(aggregatorId?: string): number {
  if (aggregatorId) {
    const aggregator = getAggregatorById(aggregatorId);
    if (aggregator) return aggregator.defaultDailyLimit;
  }
  return 50;
}

/**
 * Determine feed icon based on aggregator metadata.
 */
function determineFeedIcon(aggregatorId?: string, currentIcon?: string | null): string | null {
  if (!aggregatorId) return currentIcon || null;

  try {
    const metadata = getAggregatorMetadataById(aggregatorId);
    if (metadata.type === "managed" && metadata.icon) return metadata.icon;
    return currentIcon || metadata.icon || null;
  } catch (error) {
    logger.warn({ error, aggregator: aggregatorId }, "Failed to get aggregator icon");
    return currentIcon || null;
  }
}

/**
 * Sync feed icon from web.
 */
async function syncFeedIcon(feedId: number): Promise<Feed | null> {
  try {
    const { processIconFetch } = await import("./icon.service");
    await processIconFetch(feedId, false);
    const [updatedFeed] = await db.select().from(feeds).where(eq(feeds.id, feedId)).limit(1);
    return updatedFeed || null;
  } catch (error) {
    logger.warn({ error, feedId }, "Failed to fetch feed icon");
    return null;
  }
}

/**
 * Create a new feed.
 */
export async function createFeed(
  user: UserInfo,
  data: FeedInsert & { groupIds?: number[] },
): Promise<Feed> {
  // Extract groupIds from data
  const { groupIds, ...feedData } = data;

  // Set aggregator-specific default for dailyPostLimit
  if (feedData.dailyPostLimit === undefined) {
    feedData.dailyPostLimit = getDefaultDailyLimit(feedData.aggregator);
  }

  // Filter out restricted options and AI features for managed aggregators
  const filteredFields = filterManagedFeedData(feedData, feedData.aggregator);

  // For managed aggregators, always use the aggregator's icon
  const icon = determineFeedIcon(feedData.aggregator, feedData.icon);

  const [feed] = await db
    .insert(feeds)
    .values({
      ...feedData,
      ...filteredFields,
      icon: icon || null,
      userId: user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  // Set feed groups if provided
  if (groupIds && groupIds.length > 0) {
    await setFeedGroups(feed.id, user.id, groupIds);
  }

  // Fetch icon synchronously if icon is not set
  if (!feed.icon) {
    const updatedFeed = await syncFeedIcon(feed.id);
    if (updatedFeed) Object.assign(feed, updatedFeed);
  }

  logger.info({ feedId: feed.id, userId: user.id, groupIds }, "Feed created");

  return feed;
}

/**
 * Sync feed icon from web on update.
 */
async function syncFeedIconOnUpdate(feedId: number): Promise<Feed | null> {
  try {
    const { processIconFetch } = await import("./icon.service");
    await processIconFetch(feedId, true);
    const [reloadedFeed] = await db.select().from(feeds).where(eq(feeds.id, feedId)).limit(1);
    return reloadedFeed || null;
  } catch (error) {
    logger.warn({ error, feedId }, "Failed to fetch feed icon on update");
    return null;
  }
}

/**
 * Update feed.
 */
export async function updateFeed(
  id: number,
  user: UserInfo,
  data: Partial<FeedInsert> & { groupIds?: number[] },
): Promise<Feed> {
  // Check access
  const existingFeed = await getFeed(id, user);

  // Extract groupIds from data
  const { groupIds, ...feedData } = data;

  // Filter out restricted options and AI features for managed aggregators
  const aggregatorId = feedData.aggregator || existingFeed.aggregator;
  const filteredFields = filterManagedFeedData(feedData, aggregatorId);

  const [updated] = await db
    .update(feeds)
    .set({ ...feedData, ...filteredFields, updatedAt: new Date() })
    .where(eq(feeds.id, id))
    .returning();

  if (!updated) {
    throw new Error(`Feed with id ${id} not found`);
  }

  // Update feed groups if provided
  if (groupIds !== undefined) {
    await setFeedGroups(id, user.id, groupIds);
  }

  // Always fetch icon synchronously when updating a feed
  const reloadedFeed = await syncFeedIconOnUpdate(id);
  if (reloadedFeed) {
    Object.assign(updated, reloadedFeed);
  }

  logger.info({ feedId: id, userId: user.id, groupIds }, "Feed updated");

  return updated;
}

/**
 * Delete feed.
 */
export async function deleteFeed(id: number, user: UserInfo): Promise<void> {
  // Check access
  await getFeed(id, user);

  await db.delete(feeds).where(eq(feeds.id, id));

  logger.info({ feedId: id, userId: user.id }, "Feed deleted");
}

/**
 * Clear all articles from a feed.
 */
export async function clearFeedArticles(
  id: number,
  user: UserInfo,
): Promise<void> {
  // Check access
  await getFeed(id, user);

  await db.delete(articles).where(eq(articles.feedId, id));

  logger.info({ feedId: id, userId: user.id }, "Feed articles cleared");
}
