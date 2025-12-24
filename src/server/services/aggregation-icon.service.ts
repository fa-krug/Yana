/**
 * Aggregation icon service - handles feed icon collection during aggregation.
 */

import { eq } from "drizzle-orm";

import type { BaseAggregator } from "@server/aggregators/base/aggregator";
import { db, feeds } from "@server/db";
import type { Feed } from "@server/db/types";
import { logger } from "@server/utils/logger";

/**
 * Collect and update feed icon from aggregator.
 */
export async function collectFeedIcon(
  aggregator: BaseAggregator,
  feed: Feed,
): Promise<void> {
  // First, try the new collectFeedIcon() method
  try {
    const feedIconUrl = await aggregator.collectFeedIcon();
    if (feedIconUrl) {
      const { convertThumbnailUrlToBase64 } =
        await import("@server/aggregators/base/utils");
      const iconBase64 = await convertThumbnailUrlToBase64(feedIconUrl);
      if (iconBase64) {
        await db
          .update(feeds)
          .set({ icon: iconBase64 })
          .where(eq(feeds.id, feed.id));
        logger.info(
          { feedId: feed.id, aggregator: aggregator.id },
          "Updated feed icon from aggregator",
        );
        return;
      }
    }
  } catch (error) {
    logger.warn(
      { error, feedId: feed.id, aggregator: aggregator.id },
      "Failed to collect feed icon from aggregator",
    );
  }

  // Legacy support: Update feed icon if aggregator provides one via private properties
  // (for backwards compatibility with Reddit and YouTube)
  const aggregatorAny = aggregator as unknown as Record<string, unknown>;
  if (aggregatorAny["__subredditIconUrl"]) {
    try {
      const subredditIconUrl = aggregatorAny["__subredditIconUrl"] as string;
      if (subredditIconUrl) {
        const { convertThumbnailUrlToBase64 } =
          await import("@server/aggregators/base/utils");
        const iconBase64 = await convertThumbnailUrlToBase64(subredditIconUrl);
        if (iconBase64) {
          await db
            .update(feeds)
            .set({ icon: iconBase64 })
            .where(eq(feeds.id, feed.id));
          logger.info(
            { feedId: feed.id },
            "Updated feed icon from subreddit thumbnail (legacy)",
          );
          return;
        }
      }
    } catch (error) {
      logger.warn(
        { error, feedId: feed.id },
        "Failed to update feed icon from subreddit (legacy)",
      );
    }
  }

  // Legacy support: Update feed icon for YouTube channels
  if (aggregatorAny["__channelIconUrl"]) {
    try {
      const channelIconUrl = aggregatorAny["__channelIconUrl"] as string;
      if (channelIconUrl) {
        const { convertThumbnailUrlToBase64 } =
          await import("@server/aggregators/base/utils");
        const iconBase64 = await convertThumbnailUrlToBase64(channelIconUrl);
        if (iconBase64) {
          await db
            .update(feeds)
            .set({ icon: iconBase64 })
            .where(eq(feeds.id, feed.id));
          logger.info(
            { feedId: feed.id },
            "Updated feed icon from YouTube channel thumbnail (legacy)",
          );
        }
      }
    } catch (error) {
      logger.warn(
        { error, feedId: feed.id },
        "Failed to update feed icon from YouTube channel (legacy)",
      );
    }
  }
}
