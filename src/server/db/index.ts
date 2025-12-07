/**
 * Database connection and exports.
 *
 * Provides Drizzle ORM connection to SQLite database with error handling.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { DatabaseError } from '../errors';
import { logger } from '../utils/logger';

const databasePath = process.env['DATABASE_URL'] || './db.sqlite3';

let sqlite: Database.Database | null = null;

/**
 * Get or create database connection.
 * Implements reconnection logic on errors.
 */
function getDatabase(): Database.Database {
  if (!sqlite) {
    try {
      sqlite = new Database(databasePath);

      // Enable foreign keys
      sqlite.pragma('foreign_keys = ON');

      // Optimize SQLite settings
      sqlite.pragma('journal_mode = WAL'); // Write-Ahead Logging
      sqlite.pragma('synchronous = NORMAL');
      sqlite.pragma('cache_size = -64000'); // 64MB cache
      sqlite.pragma('temp_store = MEMORY');

      logger.info({ path: databasePath }, 'Database connection established');
    } catch (error) {
      logger.error({ error, path: databasePath }, 'Failed to connect to database');
      throw new DatabaseError('Failed to connect to database', error as Error);
    }
  }

  return sqlite;
}

// Create Drizzle instance
// Note: This is created at module load time, so DATABASE_URL must be set
// before this module is imported for tests to work correctly
let _db: ReturnType<typeof drizzle> | null = null;

function getDb(): ReturnType<typeof drizzle> {
  if (!_db) {
    _db = drizzle(getDatabase(), { schema });
  }
  return _db;
}

/**
 * Reconnect to database.
 * Used when connection is lost or when switching to test database.
 * Also recreates the drizzle instance to use the new connection.
 */
export function reconnectDatabase(): void {
  if (sqlite) {
    try {
      sqlite.close();
    } catch (error) {
      logger.warn({ error }, 'Error closing database connection');
    }
    sqlite = null;
  }
  _db = null; // Clear drizzle instance so it gets recreated with new connection
  getDatabase();
}

// Export db as a proxy that always uses the current drizzle instance
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    return getDb()[prop as keyof ReturnType<typeof drizzle>];
  },
});

// Export schema for use in migrations and type generation
export * from './schema';

// Export types
export * from './types';

// Export database instance for direct access if needed
export { getDatabase };
