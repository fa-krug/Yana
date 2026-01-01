/**
 * Aggregation icon service - handles feed icon collection during aggregation.
 */

import { eq } from "drizzle-orm";

import type { BaseAggregator } from "@server/aggregators/base/aggregator";
import { db, feeds } from "@server/db";
import type { Feed } from "@server/db/types";
import { logger } from "@server/utils/logger";

/**
 * Update feed icon in database.
 */
async function updateFeedIconInDb(
  feedId: number,
  iconUrl: string,
  source: string,
): Promise<boolean> {
  try {
    const { convertThumbnailUrlToBase64 } =
      await import("@server/aggregators/base/utils");
    const iconBase64 = await convertThumbnailUrlToBase64(iconUrl);
    if (iconBase64) {
      await db
        .update(feeds)
        .set({ icon: iconBase64 })
        .where(eq(feeds.id, feedId));
      logger.info({ feedId, source }, `Updated feed icon from ${source}`);
      return true;
    }
  } catch (error) {
    logger.warn(
      { error, feedId, source },
      `Failed to update feed icon from ${source}`,
    );
  }
  return false;
}

/**
 * Collect and update feed icon from aggregator.
 */
export async function collectFeedIcon(
  aggregator: BaseAggregator,
  feed: Feed,
): Promise<void> {
  // Try the new collectFeedIcon() method
  try {
    const feedIconUrl = await aggregator.collectFeedIcon();
    if (
      feedIconUrl &&
      (await updateFeedIconInDb(feed.id, feedIconUrl, "aggregator"))
    )
      return;
  } catch (error) {
    logger.warn(
      { error, feedId: feed.id, aggregator: aggregator.id },
      "Failed to collect feed icon",
    );
  }

  // Legacy support: Reddit and YouTube
  const aggregatorAny = aggregator as unknown as Record<string, unknown>;
  if (aggregatorAny["__subredditIconUrl"]) {
    if (
      await updateFeedIconInDb(
        feed.id,
        aggregatorAny["__subredditIconUrl"] as string,
        "subreddit (legacy)",
      )
    )
      return;
  }

  if (aggregatorAny["__channelIconUrl"]) {
    await updateFeedIconInDb(
      feed.id,
      aggregatorAny["__channelIconUrl"] as string,
      "YouTube channel (legacy)",
    );
  }
}
