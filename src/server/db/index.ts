/**
 * Database connection and exports.
 *
 * Provides Drizzle ORM connection to SQLite database with error handling.
 */

import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { DatabaseError } from "../errors";
import { logger } from "../utils/logger";

import * as schema from "./schema";

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
    const databasePath = getDatabasePath();

    // During build time (Angular route extraction), use in-memory database
    // to avoid native module loading issues
    const isBuildContext =
      databasePath.includes("/tmp/build-db") ||
      process.env["NG_BUILD"] === "true" ||
      process.argv.some((arg) => arg.includes("ng") && arg.includes("build"));

    if (isBuildContext) {
      // Use in-memory database during build to avoid native module issues
      try {
        sqlite = new Database(":memory:");
        sqlite.pragma("foreign_keys = ON");
        logger.warn("Using in-memory database for build context");
      } catch (error) {
        // If even in-memory fails, we're in a problematic state
        // This shouldn't happen, but handle it gracefully
        logger.error(
          { error },
          "Failed to create in-memory database during build",
        );
        throw new DatabaseError(
          "Failed to create database during build",
          error as Error,
        );
      }
      return sqlite;
    }

    try {
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
      logger.error(
        { error, path: databasePath },
        "Failed to connect to database",
      );
      throw new DatabaseError("Failed to connect to database", error as Error);
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
