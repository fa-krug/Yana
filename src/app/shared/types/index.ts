/**
 * Re-export server types for Angular app.
 *
 * This provides a convenient import path for Angular components:
 * import type { User, Feed, Article } from '@app/shared/types';
 */

export type {
  User,
  UserInsert,
  Feed,
  FeedInsert,
  Article,
  ArticleInsert,
  UserArticleState,
  UserArticleStateInsert,
  Group,
  GroupInsert,
  UserSettings,
  UserSettingsInsert,
  UserAIQuota,
  UserAIQuotaInsert,
  GReaderAuthToken,
  Task,
  FeedType,
} from '@server/db/types';
