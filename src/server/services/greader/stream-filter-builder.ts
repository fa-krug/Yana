/**
 * Stream filter builder for Google Reader API tag/state operations.
 * Supports filtering by feed, label (including special labels), or default (all feeds).
 */

import { eq, and, or, isNull, inArray, SQL } from "drizzle-orm";

import { db, articles, feeds } from "@server/db";

/**
 * Result of building query conditions for a stream filter.
 */
export interface StreamFilterResult {
  conditions: SQL<unknown>[];
  needsFeedJoin: boolean;
}

/**
 * Stream filter interface for different stream ID types.
 */
interface StreamFilter {
  canHandle(streamId: string | undefined): boolean;
  buildConditions(
    streamId: string | undefined,
    userId: number,
  ): Promise<StreamFilterResult>;
}

/**
 * Filter for feed-specific streams (feed/123).
 */
class FeedStreamFilter implements StreamFilter {
  canHandle(streamId: string | undefined): boolean {
    return streamId?.startsWith("feed/") ?? false;
  }

  async buildConditions(
    streamId: string,
    _userId: number,
  ): Promise<StreamFilterResult> {
    const feedId = parseInt(streamId.replace("feed/", ""), 10);
    return {
      conditions: [eq(articles.feedId, feedId)],
      needsFeedJoin: false,
    };
  }
}

/**
 * Filter for label streams (user/-/label/*).
 */
class LabelStreamFilter implements StreamFilter {
  canHandle(streamId: string | undefined): boolean {
    return streamId?.startsWith("user/-/label/") ?? false;
  }

  async buildConditions(
    streamId: string,
    userId: number,
  ): Promise<StreamFilterResult> {
    const labelName = streamId.replace("user/-/label/", "");

    // Handle special built-in labels
    if (labelName === "Reddit") {
      return this.buildFeedTypeFilter("reddit", userId);
    }
    if (labelName === "YouTube") {
      return this.buildFeedTypeFilter("youtube", userId);
    }
    if (labelName === "Podcasts") {
      return this.buildFeedTypeFilter("podcast", userId);
    }

    // Handle custom user groups
    return this.buildCustomGroupFilter(labelName, userId);
  }

  private buildFeedTypeFilter(
    feedType: string,
    userId: number,
  ): StreamFilterResult {
    return {
      conditions: [
        or(eq(feeds.userId, userId), isNull(feeds.userId)),
        eq(feeds.enabled, true),
        eq(feeds.feedType, feedType),
      ],
      needsFeedJoin: true,
    };
  }

  private async buildCustomGroupFilter(
    labelName: string,
    userId: number,
  ): Promise<StreamFilterResult> {
    const { groups, feedGroups } = await import("@server/db");

    // Look up the group
    const [group] = await db
      .select({ id: groups.id })
      .from(groups)
      .where(
        and(
          eq(groups.name, labelName),
          or(eq(groups.userId, userId), isNull(groups.userId)),
        ),
      )
      .limit(1);

    if (!group) {
      // Group not found - return condition that matches nothing
      return {
        conditions: [eq(articles.feedId, -1)],
        needsFeedJoin: false,
      };
    }

    // Get feed IDs for this group
    const feedIds = await db
      .select({ feedId: feedGroups.feedId })
      .from(feedGroups)
      .where(eq(feedGroups.groupId, group.id));

    if (feedIds.length === 0) {
      // Group has no feeds - return condition that matches nothing
      return {
        conditions: [eq(articles.feedId, -1)],
        needsFeedJoin: false,
      };
    }

    // Filter articles by feed IDs in this group
    return {
      conditions: [inArray(articles.feedId, feedIds.map((f) => f.feedId))],
      needsFeedJoin: false,
    };
  }
}

/**
 * Filter for default stream (all feeds for user).
 */
class DefaultStreamFilter implements StreamFilter {
  canHandle(_streamId: string | undefined): boolean {
    return true;
  }

  async buildConditions(
    _streamId: string | undefined,
    userId: number,
  ): Promise<StreamFilterResult> {
    return {
      conditions: [
        or(eq(feeds.userId, userId), isNull(feeds.userId)),
        eq(feeds.enabled, true),
      ],
      needsFeedJoin: true,
    };
  }
}

/**
 * Stream filter orchestrator.
 * Builds query conditions based on stream ID type.
 */
export class StreamFilterOrchestrator {
  private filters: StreamFilter[] = [
    new FeedStreamFilter(),
    new LabelStreamFilter(),
    new DefaultStreamFilter(),
  ];

  async buildQuery(
    streamId: string | undefined,
    userId: number,
  ): Promise<StreamFilterResult> {
    const filter = this.filters.find((f) => f.canHandle(streamId));

    if (!filter) {
      throw new Error("No stream filter handler found");
    }

    return filter.buildConditions(streamId, userId);
  }
}
