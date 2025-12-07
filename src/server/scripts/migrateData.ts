/**
 * Data migration script from Django to Node.js.
 *
 * This script migrates data from the Django SQLite database to the new Node.js database.
 * Run this AFTER the new system is tested and working.
 *
 * Usage:
 *   tsx src/server/scripts/migrateData.ts [--source-db <path>] [--dry-run]
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { logger } from "../utils/logger";
import * as bcrypt from "bcrypt";
import * as path from "path";
import * as fs from "fs";

interface MigrationOptions {
  sourceDbPath: string;
  targetDbPath: string;
  dryRun: boolean;
}

/**
 * Migrate users from Django to Node.js.
 */
async function migrateUsers(
  sourceDb: Database.Database,
  targetDb: ReturnType<typeof drizzle>,
  dryRun: boolean,
): Promise<number> {
  logger.info("Migrating users...");

  const users = sourceDb
    .prepare(
      "SELECT id, username, email, password, is_superuser, is_staff, is_active, date_joined FROM auth_user",
    )
    .all() as Array<{
    id: number;
    username: string;
    email: string;
    password: string;
    is_superuser: number;
    is_staff: number;
    is_active: number;
    date_joined: string;
  }>;

  let migrated = 0;

  for (const user of users) {
    if (dryRun) {
      logger.info({ username: user.username }, "Would migrate user (dry-run)");
      migrated++;
      continue;
    }

    try {
      await targetDb.insert(schema.users).values({
        id: user.id,
        username: user.username,
        email: user.email,
        passwordHash: user.password, // Django already has bcrypt hash
        isSuperuser: Boolean(user.is_superuser),
        isStaff: Boolean(user.is_staff),
        createdAt: new Date(user.date_joined),
        updatedAt: new Date(user.date_joined),
      });

      migrated++;
      logger.debug({ username: user.username }, "User migrated");
    } catch (error) {
      logger.error(
        { error, username: user.username },
        "Failed to migrate user",
      );
    }
  }

  logger.info({ count: migrated }, "Users migration completed");
  return migrated;
}

/**
 * Migrate feeds from Django to Node.js.
 */
async function migrateFeeds(
  sourceDb: Database.Database,
  targetDb: ReturnType<typeof drizzle>,
  dryRun: boolean,
): Promise<number> {
  logger.info("Migrating feeds...");

  const feeds = sourceDb
    .prepare(
      "SELECT id, user_id, name, identifier, aggregator, feed_type, enabled, aggregator_options, icon, created_at, updated_at FROM core_feed",
    )
    .all() as Array<{
    id: number;
    user_id: number;
    name: string;
    identifier: string;
    aggregator: string;
    feed_type: string;
    enabled: number;
    aggregator_options: string | null;
    icon: string | null;
    created_at: string;
    updated_at: string;
  }>;

  let migrated = 0;

  for (const feed of feeds) {
    if (dryRun) {
      logger.info(
        { feedId: feed.id, name: feed.name },
        "Would migrate feed (dry-run)",
      );
      migrated++;
      continue;
    }

    try {
      await targetDb.insert(schema.feeds).values({
        id: feed.id,
        userId: feed.user_id,
        name: feed.name,
        identifier: feed.identifier,
        aggregator: feed.aggregator,
        feedType: feed.feed_type as
          | "article"
          | "youtube"
          | "podcast"
          | "reddit",
        enabled: Boolean(feed.enabled),
        aggregatorOptions: feed.aggregator_options
          ? JSON.parse(feed.aggregator_options)
          : null,
        icon: feed.icon,
        createdAt: new Date(feed.created_at),
        updatedAt: new Date(feed.updated_at),
      });

      migrated++;
      logger.debug({ feedId: feed.id }, "Feed migrated");
    } catch (error) {
      logger.error({ error, feedId: feed.id }, "Failed to migrate feed");
    }
  }

  logger.info({ count: migrated }, "Feeds migration completed");
  return migrated;
}

/**
 * Migrate articles from Django to Node.js.
 */
async function migrateArticles(
  sourceDb: Database.Database,
  targetDb: ReturnType<typeof drizzle>,
  dryRun: boolean,
): Promise<number> {
  logger.info("Migrating articles...");

  const articles = sourceDb
    .prepare(
      "SELECT id, feed_id, name, url, date, content, author, external_id, score, thumbnail_url, media_url, duration, view_count, media_type, ai_processed, ai_error, created_at, updated_at FROM core_article",
    )
    .all() as Array<{
    id: number;
    feed_id: number;
    name: string;
    url: string;
    date: string;
    content: string;
    author: string | null;
    external_id: string | null;
    score: number | null;
    thumbnail_url: string | null;
    media_url: string | null;
    duration: number | null;
    view_count: number | null;
    media_type: string | null;
    ai_processed: number;
    ai_error: string;
    created_at: string;
    updated_at: string;
  }>;

  let migrated = 0;

  for (const article of articles) {
    if (dryRun) {
      logger.info(
        { articleId: article.id, name: article.name },
        "Would migrate article (dry-run)",
      );
      migrated++;
      continue;
    }

    try {
      await targetDb.insert(schema.articles).values({
        id: article.id,
        feedId: article.feed_id,
        name: article.name,
        url: article.url,
        date: new Date(article.date),
        content: article.content,
        author: article.author,
        externalId: article.external_id,
        score: article.score,
        thumbnailUrl: article.thumbnail_url,
        mediaUrl: article.media_url,
        duration: article.duration,
        viewCount: article.view_count,
        mediaType: article.media_type,
        aiProcessed: Boolean(article.ai_processed),
        aiError: article.ai_error,
        createdAt: new Date(article.created_at),
        updatedAt: new Date(article.updated_at),
      });

      migrated++;
      if (migrated % 100 === 0) {
        logger.info({ count: migrated }, "Articles migrated so far...");
      }
    } catch (error) {
      logger.error(
        { error, articleId: article.id },
        "Failed to migrate article",
      );
    }
  }

  logger.info({ count: migrated }, "Articles migration completed");
  return migrated;
}

/**
 * Migrate user article states from Django to Node.js.
 */
async function migrateUserArticleStates(
  sourceDb: Database.Database,
  targetDb: ReturnType<typeof drizzle>,
  dryRun: boolean,
): Promise<number> {
  logger.info("Migrating user article states...");

  const states = sourceDb
    .prepare(
      "SELECT id, user_id, article_id, is_read, is_saved, created_at, updated_at FROM core_userarticlestate",
    )
    .all() as Array<{
    id: number;
    user_id: number;
    article_id: number;
    is_read: number;
    is_saved: number;
    created_at: string;
    updated_at: string;
  }>;

  let migrated = 0;

  for (const state of states) {
    if (dryRun) {
      logger.debug(
        { stateId: state.id },
        "Would migrate user article state (dry-run)",
      );
      migrated++;
      continue;
    }

    try {
      await targetDb.insert(schema.userArticleStates).values({
        id: state.id,
        userId: state.user_id,
        articleId: state.article_id,
        isRead: Boolean(state.is_read),
        isSaved: Boolean(state.is_saved),
        createdAt: new Date(state.created_at),
        updatedAt: new Date(state.updated_at),
      });

      migrated++;
      if (migrated % 1000 === 0) {
        logger.info(
          { count: migrated },
          "User article states migrated so far...",
        );
      }
    } catch (error) {
      logger.error(
        { error, stateId: state.id },
        "Failed to migrate user article state",
      );
    }
  }

  logger.info({ count: migrated }, "User article states migration completed");
  return migrated;
}

/**
 * Migrate groups from Django to Node.js.
 */
async function migrateGroups(
  sourceDb: Database.Database,
  targetDb: ReturnType<typeof drizzle>,
  dryRun: boolean,
): Promise<number> {
  logger.info("Migrating groups...");

  const groups = sourceDb
    .prepare("SELECT id, user_id, name, created_at, updated_at FROM core_group")
    .all() as Array<{
    id: number;
    user_id: number;
    name: string;
    created_at: string;
    updated_at: string;
  }>;

  let migrated = 0;

  for (const group of groups) {
    if (dryRun) {
      logger.info(
        { groupId: group.id, name: group.name },
        "Would migrate group (dry-run)",
      );
      migrated++;
      continue;
    }

    try {
      await targetDb.insert(schema.groups).values({
        id: group.id,
        userId: group.user_id,
        name: group.name,
        createdAt: new Date(group.created_at),
        updatedAt: new Date(group.updated_at),
      });

      migrated++;
    } catch (error) {
      logger.error({ error, groupId: group.id }, "Failed to migrate group");
    }
  }

  logger.info({ count: migrated }, "Groups migration completed");
  return migrated;
}

/**
 * Migrate feed groups from Django to Node.js.
 */
async function migrateFeedGroups(
  sourceDb: Database.Database,
  targetDb: ReturnType<typeof drizzle>,
  dryRun: boolean,
): Promise<number> {
  logger.info("Migrating feed groups...");

  const feedGroups = sourceDb
    .prepare("SELECT id, feed_id, group_id FROM core_feed_groups")
    .all() as Array<{
    id: number;
    feed_id: number;
    group_id: number;
  }>;

  let migrated = 0;

  for (const fg of feedGroups) {
    if (dryRun) {
      logger.debug(
        { feedGroupId: fg.id },
        "Would migrate feed group (dry-run)",
      );
      migrated++;
      continue;
    }

    try {
      await targetDb.insert(schema.feedGroups).values({
        id: fg.id,
        feedId: fg.feed_id,
        groupId: fg.group_id,
      });

      migrated++;
    } catch (error) {
      logger.error(
        { error, feedGroupId: fg.id },
        "Failed to migrate feed group",
      );
    }
  }

  logger.info({ count: migrated }, "Feed groups migration completed");
  return migrated;
}

/**
 * Migrate user settings from Django to Node.js.
 */
async function migrateUserSettings(
  sourceDb: Database.Database,
  targetDb: ReturnType<typeof drizzle>,
  dryRun: boolean,
): Promise<number> {
  logger.info("Migrating user settings...");

  const settings = sourceDb
    .prepare(
      "SELECT id, user_id, openai_api_url, openai_api_key, ai_model, ai_temperature, ai_max_tokens, ai_request_timeout, ai_max_retries, ai_retry_delay, ai_default_daily_limit, ai_default_monthly_limit, created_at, updated_at FROM core_usersettings",
    )
    .all() as Array<{
    id: number;
    user_id: number;
    openai_api_url: string;
    openai_api_key: string;
    ai_model: string;
    ai_temperature: number;
    ai_max_tokens: number;
    ai_request_timeout: number;
    ai_max_retries: number;
    ai_retry_delay: number;
    ai_default_daily_limit: number;
    ai_default_monthly_limit: number;
    created_at: string;
    updated_at: string;
  }>;

  let migrated = 0;

  for (const setting of settings) {
    if (dryRun) {
      logger.info(
        { userId: setting.user_id },
        "Would migrate user settings (dry-run)",
      );
      migrated++;
      continue;
    }

    try {
      await targetDb.insert(schema.userSettings).values({
        id: setting.id,
        userId: setting.user_id,
        openaiApiUrl: setting.openai_api_url,
        openaiApiKey: setting.openai_api_key,
        aiModel: setting.ai_model,
        aiTemperature: setting.ai_temperature,
        aiMaxTokens: setting.ai_max_tokens,
        aiRequestTimeout: setting.ai_request_timeout,
        aiMaxRetries: setting.ai_max_retries,
        aiRetryDelay: setting.ai_retry_delay,
        aiDefaultDailyLimit: setting.ai_default_daily_limit,
        aiDefaultMonthlyLimit: setting.ai_default_monthly_limit,
        createdAt: new Date(setting.created_at),
        updatedAt: new Date(setting.updated_at),
      });

      migrated++;
    } catch (error) {
      logger.error(
        { error, userId: setting.user_id },
        "Failed to migrate user settings",
      );
    }
  }

  logger.info({ count: migrated }, "User settings migration completed");
  return migrated;
}

/**
 * Main migration function.
 */
async function migrateData(options: MigrationOptions): Promise<void> {
  logger.info({ options }, "Starting data migration");

  // Check source database exists
  if (!fs.existsSync(options.sourceDbPath)) {
    throw new Error(`Source database not found: ${options.sourceDbPath}`);
  }

  // Open source database
  const sourceDb = new Database(options.sourceDbPath, { readonly: true });

  // Open target database
  const targetDbPath =
    options.targetDbPath || process.env["DATABASE_URL"] || "./db.sqlite3";
  const targetDbConnection = new Database(targetDbPath);
  const targetDb = drizzle(targetDbConnection, { schema });

  try {
    // Run migrations in order
    const results = {
      users: await migrateUsers(sourceDb, targetDb, options.dryRun),
      feeds: await migrateFeeds(sourceDb, targetDb, options.dryRun),
      articles: await migrateArticles(sourceDb, targetDb, options.dryRun),
      userArticleStates: await migrateUserArticleStates(
        sourceDb,
        targetDb,
        options.dryRun,
      ),
      groups: await migrateGroups(sourceDb, targetDb, options.dryRun),
      feedGroups: await migrateFeedGroups(sourceDb, targetDb, options.dryRun),
      userSettings: await migrateUserSettings(
        sourceDb,
        targetDb,
        options.dryRun,
      ),
    };

    logger.info({ results }, "Data migration completed successfully");

    if (options.dryRun) {
      logger.warn("DRY RUN MODE - No data was actually migrated");
    }
  } finally {
    sourceDb.close();
    targetDbConnection.close();
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const sourceDbPath =
    args.find((arg) => arg.startsWith("--source-db="))?.split("=")[1] ||
    args[args.indexOf("--source-db") + 1] ||
    "./backend/db.sqlite3.backup";
  const dryRun = args.includes("--dry-run");

  migrateData({
    sourceDbPath,
    targetDbPath: process.env["DATABASE_URL"] || "./db.sqlite3",
    dryRun,
  })
    .then(() => {
      logger.info("Migration script completed");
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ error }, "Migration script failed");
      process.exit(1);
    });
}

export { migrateData };
