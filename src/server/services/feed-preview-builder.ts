/**
 * Feed preview object builder.
 *
 * Constructs a temporary Feed object for preview testing.
 */

import type { Feed, FeedInsert, User } from "../db/types";

type UserInfo = Pick<User, "id" | "isSuperuser">;

/**
 * Build a temporary feed object for preview testing.
 * Merges user input with sensible defaults.
 */
export function buildPreviewFeed(
  user: UserInfo,
  data: Partial<FeedInsert>,
  aggregator: any, // BaseAggregator
): Feed {
  return {
    id: -1,
    userId: user.id,
    name: data.name || "Preview Feed",
    identifier: data.identifier!,
    feedType:
      (data.feedType as "article" | "youtube" | "podcast" | "reddit") ||
      "article",
    icon: data.icon || null,
    example: data.example || "",
    aggregator: data.aggregator!,
    enabled: true,
    generateTitleImage: data.generateTitleImage ?? true,
    addSourceFooter: data.addSourceFooter ?? true,
    skipDuplicates: false,
    useCurrentTimestamp: data.useCurrentTimestamp ?? true,
    dailyPostLimit: data.dailyPostLimit ?? aggregator.defaultDailyLimit ?? 50,
    aggregatorOptions:
      (data.aggregatorOptions as Record<string, unknown>) || {},
    aiTranslateTo: data.aiTranslateTo || "",
    aiSummarize: data.aiSummarize ?? false,
    aiCustomPrompt: data.aiCustomPrompt || "",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
