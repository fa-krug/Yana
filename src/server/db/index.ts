/**
 * Database connection and exports.
 *
 * Provides Drizzle ORM connection to SQLite database with error handling.
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { DatabaseError } from "../errors";
import { logger } from "../utils/logger";
import { dirname } from "node:path";
import { mkdirSync, existsSync } from "node:fs";

let sqlite: Database.Database | null = null;

/**
 * Get database path from environment or default.
 */
function getDatabasePath(): string {
  return process.env["DATABASE_URL"] || "./db.sqlite3";
}

/**
 * Get or create database connection.
 * Implements reconnection logic on errors.
 */
function getDatabase(): Database.Database {
  if (!sqlite) {
    try {
      const databasePath = getDatabasePath();
      // Create parent directory if it doesn't exist (for build-time scenarios)
      const dir = dirname(databasePath);
      if (dir && dir !== "." && !existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      
      sqlite = new Database(databasePath);

      // Enable foreign keys
      sqlite.pragma("foreign_keys = ON");

      // Optimize SQLite settings
      sqlite.pragma("journal_mode = WAL"); // Write-Ahead Logging
      sqlite.pragma("synchronous = NORMAL");
      sqlite.pragma("cache_size = -64000"); // 64MB cache
      sqlite.pragma("temp_store = MEMORY");

      logger.info({ path: databasePath }, "Database connection established");
    } catch (error) {
      const databasePath = getDatabasePath();
      // During build time (Angular route extraction), database might not be needed
      // Check if we're in a build context by looking for Angular build indicators
      const isBuildContext = process.env["NG_BUILD"] === "true" || 
        process.argv.some(arg => arg.includes("ng") && arg.includes("build")) ||
        process.env["NODE_ENV"] === undefined; // Build might not have NODE_ENV set
      
      if (isBuildContext) {
        // Use in-memory database during build
        logger.warn({ path: databasePath }, "Using in-memory database for build context");
        sqlite = new Database(":memory:");
        sqlite.pragma("foreign_keys = ON");
      } else {
        logger.error(
          { error, path: databasePath },
          "Failed to connect to database",
        );
        throw new DatabaseError("Failed to connect to database", error as Error);
      }
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
 * Close database connection without reconnecting.
 * Useful for test teardown.
 */
export function closeDatabase(): void {
  if (sqlite) {
    try {
      sqlite.close();
    } catch (error) {
      logger.warn({ error }, "Error closing database connection");
    }
    sqlite = null;
  }
  _db = null; // Clear drizzle instance
}

/**
 * Reconnect to database.
 * Used when connection is lost or when switching to test database.
 * Also recreates the drizzle instance to use the new connection.
 */
export function reconnectDatabase(): void {
  closeDatabase();
  getDatabase();
}

// Export db as a proxy that always uses the current drizzle instance
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    return getDb()[prop as keyof ReturnType<typeof drizzle>];
  },
});

// Export schema for use in migrations and type generation
export * from "./schema";

// Export types
export * from "./types";

// Export database instance for direct access if needed
export { getDatabase };
