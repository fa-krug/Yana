/**
 * Drizzle ORM schema definitions.
 *
 * This schema mirrors the legacy database structure for migration compatibility.
 */

import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Feed type enum
export const feedTypeEnum = [
  "article",
  "youtube",
  "podcast",
  "reddit",
] as const;
export type FeedType = (typeof feedTypeEnum)[number];

/**
 * Users table
 */
export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey(),
    username: text("username").notNull().unique(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    firstName: text("first_name").notNull().default(""),
    lastName: text("last_name").notNull().default(""),
    isSuperuser: integer("is_superuser", { mode: "boolean" })
      .notNull()
      .default(false),
    isStaff: integer("is_staff", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    usernameIdx: uniqueIndex("users_username_idx").on(table.username),
  }),
);

/**
 * Feeds table
 */
export const feeds = sqliteTable(
  "feeds",
  {
    id: integer("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    identifier: text("identifier").notNull(),
    feedType: text("feed_type", { enum: feedTypeEnum })
      .notNull()
      .default("article"),
    icon: text("icon"),
    example: text("example").notNull().default(""),
    aggregator: text("aggregator").notNull().default("full_website"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    generateTitleImage: integer("generate_title_image", { mode: "boolean" })
      .notNull()
      .default(true),
    addSourceFooter: integer("add_source_footer", { mode: "boolean" })
      .notNull()
      .default(true),
    skipDuplicates: integer("skip_duplicates", { mode: "boolean" })
      .notNull()
      .default(true),
    useCurrentTimestamp: integer("use_current_timestamp", { mode: "boolean" })
      .notNull()
      .default(true),
    dailyPostLimit: integer("daily_post_limit").notNull().default(50),
    aggregatorOptions: text("aggregator_options", { mode: "json" })
      .notNull()
      .default("{}"),
    aiTranslateTo: text("ai_translate_to").notNull().default(""),
    aiSummarize: integer("ai_summarize", { mode: "boolean" })
      .notNull()
      .default(false),
    aiCustomPrompt: text("ai_custom_prompt").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    userIdIdx: index("feeds_user_id_idx").on(table.userId),
    feedTypeIdx: index("feeds_feed_type_idx").on(table.feedType),
  }),
);

/**
 * Articles table
 */
export const articles = sqliteTable(
  "articles",
  {
    id: integer("id").primaryKey(),
    feedId: integer("feed_id")
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull().unique(),
    date: integer("date", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    content: text("content").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    mediaUrl: text("media_url"),
    duration: integer("duration"),
    viewCount: integer("view_count"),
    mediaType: text("media_type"),
    author: text("author"),
    externalId: text("external_id"),
    score: integer("score"),
    aiProcessed: integer("ai_processed", { mode: "boolean" })
      .notNull()
      .default(false),
    aiError: text("ai_error").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    urlIdx: uniqueIndex("articles_url_idx").on(table.url),
    feedIdIdx: index("articles_feed_id_idx").on(table.feedId),
    dateIdx: index("articles_date_idx").on(table.date),
    feedDateIdx: index("articles_feed_date_idx").on(table.feedId, table.date),
    feedNameCreatedIdx: index("articles_feed_name_created_idx").on(
      table.feedId,
      table.name,
      table.createdAt,
    ),
    feedCreatedIdx: index("articles_feed_created_idx").on(
      table.feedId,
      table.createdAt,
    ),
    feedDateIdIdx: index("articles_feed_date_id_idx").on(
      table.feedId,
      table.date,
      table.id,
    ),
    externalIdIdx: index("articles_external_id_idx").on(table.externalId),
  }),
);

/**
 * User Article States table (tracks read/saved state)
 */
export const userArticleStates = sqliteTable(
  "user_article_states",
  {
    id: integer("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
    isSaved: integer("is_saved", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    userArticleIdx: uniqueIndex("user_article_states_user_article_idx").on(
      table.userId,
      table.articleId,
    ),
    userReadIdx: index("user_article_states_user_read_idx").on(
      table.userId,
      table.isRead,
    ),
    userSavedIdx: index("user_article_states_user_saved_idx").on(
      table.userId,
      table.isSaved,
    ),
    userArticleReadIdx: index("user_article_states_user_article_read_idx").on(
      table.userId,
      table.articleId,
      table.isRead,
    ),
    userReadArticleIdx: index("user_article_states_user_read_article_idx").on(
      table.userId,
      table.isRead,
      table.articleId,
    ),
  }),
);

/**
 * Groups table (for organizing feeds)
 */
export const groups = sqliteTable(
  "groups",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    nameUserIdx: uniqueIndex("groups_name_user_idx").on(
      table.name,
      table.userId,
    ),
    userIdIdx: index("groups_user_id_idx").on(table.userId),
  }),
);

/**
 * Feed-Group many-to-many relationship
 */
export const feedGroups = sqliteTable(
  "feed_groups",
  {
    id: integer("id").primaryKey(),
    feedId: integer("feed_id")
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
  },
  (table) => ({
    feedGroupIdx: uniqueIndex("feed_groups_feed_group_idx").on(
      table.feedId,
      table.groupId,
    ),
    feedIdIdx: index("feed_groups_feed_id_idx").on(table.feedId),
    groupIdIdx: index("feed_groups_group_id_idx").on(table.groupId),
  }),
);

/**
 * User Settings table
 */
export const userSettings = sqliteTable(
  "user_settings",
  {
    id: integer("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),
    // Reddit API
    redditEnabled: integer("reddit_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    redditClientId: text("reddit_client_id").notNull().default(""),
    redditClientSecret: text("reddit_client_secret").notNull().default(""),
    redditUserAgent: text("reddit_user_agent").notNull().default("Yana/1.0"),
    // YouTube API
    youtubeEnabled: integer("youtube_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    youtubeApiKey: text("youtube_api_key").notNull().default(""),
    // OpenAI API
    openaiEnabled: integer("openai_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    openaiApiUrl: text("openai_api_url")
      .notNull()
      .default("https://api.openai.com/v1"),
    openaiApiKey: text("openai_api_key").notNull().default(""),
    aiModel: text("ai_model").notNull().default("gpt-4o-mini"),
    aiTemperature: real("ai_temperature").notNull().default(0.3),
    aiMaxTokens: integer("ai_max_tokens").notNull().default(2000),
    aiDefaultDailyLimit: integer("ai_default_daily_limit")
      .notNull()
      .default(200),
    aiDefaultMonthlyLimit: integer("ai_default_monthly_limit")
      .notNull()
      .default(2000),
    aiMaxPromptLength: integer("ai_max_prompt_length").notNull().default(500),
    aiRequestTimeout: integer("ai_request_timeout").notNull().default(120),
    aiMaxRetries: integer("ai_max_retries").notNull().default(3),
    aiRetryDelay: integer("ai_retry_delay").notNull().default(2),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    userIdIdx: uniqueIndex("user_settings_user_id_idx").on(table.userId),
  }),
);

/**
 * User AI Quota table
 */
export const userAIQuotas = sqliteTable(
  "user_ai_quotas",
  {
    id: integer("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),
    dailyLimit: integer("daily_limit").notNull().default(200),
    monthlyLimit: integer("monthly_limit").notNull().default(2000),
    dailyUsed: integer("daily_used").notNull().default(0),
    monthlyUsed: integer("monthly_used").notNull().default(0),
    dailyResetAt: integer("daily_reset_at", { mode: "timestamp" }).notNull(),
    monthlyResetAt: integer("monthly_reset_at", {
      mode: "timestamp",
    }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    userIdIdx: uniqueIndex("user_ai_quotas_user_id_idx").on(table.userId),
  }),
);

/**
 * Google Reader Auth Tokens table
 */
export const greaderAuthTokens = sqliteTable(
  "greader_auth_tokens",
  {
    id: integer("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    tokenIdx: uniqueIndex("greader_auth_tokens_token_idx").on(table.token),
    userIdIdx: index("greader_auth_tokens_user_id_idx").on(table.userId),
  }),
);

/**
 * Tasks table (for DB-based task queue)
 */
export const tasks = sqliteTable(
  "tasks",
  {
    id: integer("id").primaryKey(),
    type: text("type").notNull(),
    status: text("status", {
      enum: ["pending", "running", "completed", "failed"],
    })
      .notNull()
      .default("pending"),
    payload: text("payload", { mode: "json" }).notNull().default("{}"),
    result: text("result", { mode: "json" }),
    error: text("error"),
    retries: integer("retries").notNull().default(0),
    maxRetries: integer("max_retries").notNull().default(3),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    startedAt: integer("started_at", { mode: "timestamp" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
  },
  (table) => ({
    statusIdx: index("tasks_status_idx").on(table.status),
    typeStatusIdx: index("tasks_type_status_idx").on(table.type, table.status),
    createdAtIdx: index("tasks_created_at_idx").on(table.createdAt),
  }),
);

/**
 * Sessions table (for express-session storage)
 */
export const sessions = sqliteTable(
  "sessions",
  {
    sid: text("sid").primaryKey(),
    sess: text("sess").notNull(),
    expire: integer("expire").notNull(),
  },
  (table) => ({
    expireIdx: index("sessions_expire_idx").on(table.expire),
  }),
);

/**
 * Task executions table (for scheduled task execution history)
 */
export const taskExecutions = sqliteTable(
  "task_executions",
  {
    id: integer("id").primaryKey(),
    taskId: text("task_id").notNull(),
    executedAt: integer("executed_at", { mode: "timestamp" }).notNull(),
    status: text("status", { enum: ["success", "failed"] }).notNull(),
    error: text("error"),
    duration: integer("duration"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    taskIdIdx: index("task_executions_task_id_idx").on(table.taskId),
    executedAtIdx: index("task_executions_executed_at_idx").on(
      table.executedAt,
    ),
    statusIdx: index("task_executions_status_idx").on(table.status),
  }),
);
