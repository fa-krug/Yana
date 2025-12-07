/**
 * Database migration script.
 *
 * Uses drizzle-kit to create and run migrations.
 * Includes error handling, backup, and validation.
 *
 * Usage:
 *   npm run db:migrate
 */

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

const databasePath = process.env['DATABASE_URL'] || './db.sqlite3';
const migrationsFolder = './src/server/db/migrations';

/**
 * Create backup of database before migration.
 */
function createBackup(): string {
  const backupPath = `${databasePath}.backup.${Date.now()}`;
  try {
    if (fs.existsSync(databasePath)) {
      fs.copyFileSync(databasePath, backupPath);
      logger.info({ backupPath }, 'Database backup created');
    }
    return backupPath;
  } catch (error) {
    logger.warn({ error }, 'Failed to create backup, continuing anyway');
    return backupPath;
  }
}

/**
 * Validate migration by checking if tables exist.
 */
function validateMigration(db: ReturnType<typeof drizzle>, sqlite: Database.Database): boolean {
  try {
    const result = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tables = (result as unknown as { name: string }[]).map(r => r.name);
    logger.info({ tables }, 'Migration validation: tables exist');
    return tables.length > 0;
  } catch (error) {
    logger.error({ error }, 'Migration validation failed');
    return false;
  }
}

async function runMigrations() {
  logger.info({ databasePath, migrationsFolder }, 'Starting database migrations');

  // Create backup
  const backupPath = createBackup();

  const sqlite = new Database(databasePath);
  const db = drizzle(sqlite, { schema });

  try {
    // Check if migrations folder exists
    if (!fs.existsSync(migrationsFolder)) {
      logger.warn({ migrationsFolder }, 'Migrations folder does not exist, creating it');
      fs.mkdirSync(migrationsFolder, { recursive: true });
    }

    // Run migrations
    migrate(db, { migrationsFolder });

    // Validate migration
    if (!validateMigration(db, sqlite)) {
      throw new Error('Migration validation failed');
    }

    logger.info('Migrations completed successfully!');
  } catch (error) {
    logger.error({ error, backupPath }, 'Migration failed');
    logger.info({ backupPath }, 'To restore backup, copy the backup file over the database file');
    process.exit(1);
  } finally {
    sqlite.close();
  }
}

runMigrations().catch(error => {
  logger.error({ error }, 'Migration error');
  process.exit(1);
});
