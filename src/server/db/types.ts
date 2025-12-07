/**
 * Shared types exported from Drizzle schema.
 *
 * These types are generated from the Drizzle schema and can be imported
 * by the Angular app for type safety.
 *
 * Example usage in Angular:
 * import type { User, Feed, Article } from '@server/db/types';
 */

import type {
  users,
  feeds,
  articles,
  userArticleStates,
  groups,
  feedGroups,
  userSettings,
  userAIQuotas,
  greaderAuthTokens,
  tasks,
  taskExecutions,
} from './schema';

// Infer types from schema
export type User = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;

export type Feed = typeof feeds.$inferSelect;
export type FeedInsert = typeof feeds.$inferInsert;

export type Article = typeof articles.$inferSelect;
export type ArticleInsert = typeof articles.$inferInsert;

export type UserArticleState = typeof userArticleStates.$inferSelect;
export type UserArticleStateInsert = typeof userArticleStates.$inferInsert;

export type Group = typeof groups.$inferSelect;
export type GroupInsert = typeof groups.$inferInsert;

export type FeedGroup = typeof feedGroups.$inferSelect;
export type FeedGroupInsert = typeof feedGroups.$inferInsert;

export type UserSettings = typeof userSettings.$inferSelect;
export type UserSettingsInsert = typeof userSettings.$inferInsert;

export type UserAIQuota = typeof userAIQuotas.$inferSelect;
export type UserAIQuotaInsert = typeof userAIQuotas.$inferInsert;

export type GReaderAuthToken = typeof greaderAuthTokens.$inferSelect;
export type GReaderAuthTokenInsert = typeof greaderAuthTokens.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type TaskInsert = typeof tasks.$inferInsert;

export type TaskExecution = typeof taskExecutions.$inferSelect;
export type TaskExecutionInsert = typeof taskExecutions.$inferInsert;

// Re-export feed type enum
export type { FeedType } from './schema';
