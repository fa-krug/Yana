/**
 * Feed CRUD service - handles feed create, update, delete operations.
 */

import { eq } from "drizzle-orm";
import { db, feeds, articles } from "../db";
import { logger } from "../utils/logger";
import type { Feed, FeedInsert, User } from "../db/types";
import { getAggregatorById } from "../aggregators/registry";
import { getAggregatorMetadataById } from "./aggregator.service";
import { setFeedGroups } from "./group.service";
import { getFeed } from "./feed-query.service";

/**
 * Minimal user info needed for feed operations.
 */
type UserInfo = Pick<User, "id" | "isSuperuser">;

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
  if (!aggregatorId) {
    return {};
  }

  try {
    const aggregatorMetadata = getAggregatorMetadataById(aggregatorId);

    if (aggregatorMetadata.type === "managed") {
      const filtered: {
        aggregatorOptions?: Record<string, unknown>;
        aiTranslateTo?: string;
        aiSummarize?: boolean;
        aiCustomPrompt?: string;
      } = {};

      // Filter out restricted aggregator options
      // Only process if aggregatorOptions is explicitly provided (not null or undefined)
      if (
        data.aggregatorOptions !== undefined &&
        data.aggregatorOptions !== null
      ) {
        const restrictedOptions = [
          "exclude_selectors",
          "ignore_content_contains",
          "ignore_title_contains",
          "regex_replacements",
        ];
        const filteredOptions: Record<string, unknown> = {};
        Object.entries(data.aggregatorOptions).forEach(([key, value]) => {
          if (!restrictedOptions.includes(key)) {
            filteredOptions[key] = value;
          }
        });
        filtered.aggregatorOptions = filteredOptions;
      }
      // If aggregatorOptions is undefined or null, don't set it in filtered
      // This allows existing options to be preserved during update

      // Filter out AI features
      filtered.aiTranslateTo = "";
      filtered.aiSummarize = false;
      filtered.aiCustomPrompt = "";

      return filtered;
    }
  } catch (error) {
    // If we can't get aggregator metadata, continue without filtering
    logger.warn(
      { error, aggregator: aggregatorId },
      "Failed to get aggregator metadata for filtering",
    );
  }

  return {};
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

  // Set aggregator-specific default for dailyPostLimit if not provided
  if (feedData.dailyPostLimit === undefined && feedData.aggregator) {
    const aggregator = getAggregatorById(feedData.aggregator);
    if (aggregator) {
      feedData.dailyPostLimit = aggregator.defaultDailyLimit;
    } else {
      feedData.dailyPostLimit = 50; // Fallback if aggregator not found
    }
  } else if (feedData.dailyPostLimit === undefined) {
    feedData.dailyPostLimit = 50; // Fallback if no aggregator specified
  }

  // Filter out restricted options and AI features for managed aggregators
  const filteredFields = filterManagedFeedData(feedData, feedData.aggregator);

  // For managed aggregators, always use the aggregator's icon
  let icon = feedData.icon;
  if (feedData.aggregator) {
    try {
      const aggregatorMetadata = getAggregatorMetadataById(feedData.aggregator);
      // If aggregator is managed, always use its icon
      if (aggregatorMetadata.type === "managed" && aggregatorMetadata.icon) {
        icon = aggregatorMetadata.icon;
      } else if (!icon && aggregatorMetadata.icon) {
        // For non-managed aggregators, use icon if not provided
        icon = aggregatorMetadata.icon;
      }
    } catch (error) {
      // If we can't get aggregator metadata, continue without icon
      logger.warn(
        { error, aggregator: feedData.aggregator },
        "Failed to get aggregator icon",
      );
    }
  }

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
    try {
      const { processIconFetch } = await import("./icon.service");
      await processIconFetch(feed.id, false);
      // Reload feed to get updated icon
      const [updatedFeed] = await db
        .select()
        .from(feeds)
        .where(eq(feeds.id, feed.id))
        .limit(1);
      if (updatedFeed) {
        Object.assign(feed, updatedFeed);
      }
    } catch (error) {
      logger.warn(
        { error, feedId: feed.id },
        "Failed to fetch feed icon on create",
      );
      // Continue without icon - not critical
    }
  }

  logger.info({ feedId: feed.id, userId: user.id, groupIds }, "Feed created");

  return feed;
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

  // Always fetch icon synchronously when updating a feed to ensure it's up-to-date
  try {
    const { processIconFetch } = await import("./icon.service");
    await processIconFetch(id, true);
    // Reload feed to get updated icon
    const [reloadedFeed] = await db
      .select()
      .from(feeds)
      .where(eq(feeds.id, id))
      .limit(1);
    if (reloadedFeed) {
      Object.assign(updated, reloadedFeed);
    }
  } catch (error) {
    logger.warn({ error, feedId: id }, "Failed to fetch feed icon on update");
    // Continue without icon update - not critical
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
