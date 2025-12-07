/**
 * Test database utilities.
 */

import * as fs from "fs";
import * as path from "path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { reconnectDatabase, db, closeDatabase } from "../../src/server/db";

const TEST_DB_PATH = path.join(process.cwd(), "tests", "test.db");

/**
 * Setup test database.
 * Sets up a fresh test database and runs migrations.
 */
export function setupTestDb(): void {
  // Close any existing database connection first
  closeDatabase();

  // Set DATABASE_URL to test database before any database operations
  process.env["DATABASE_URL"] = TEST_DB_PATH;

  // Remove existing test database and related files to ensure clean state
  // SQLite with WAL mode creates .wal and .shm files that need cleanup
  const filesToClean = [
    TEST_DB_PATH,
    `${TEST_DB_PATH}-wal`,
    `${TEST_DB_PATH}-shm`,
  ];

  for (const file of filesToClean) {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch (error) {
        // Ignore errors - file might be locked, will try again
      }
    }
  }

  // Small delay to ensure file system operations complete
  // This helps avoid "database is locked" errors
  // Note: In a real async scenario, we'd use a promise, but for sync setup this works

  // Reconnect to use the test database
  // This will create a new connection to the test database
  reconnectDatabase();

  // Run migrations on the test database
  const migrationsFolder = path.resolve(
    process.cwd(),
    "src/server/db/migrations",
  );
  migrate(db, {
    migrationsFolder,
  });
}

/**
 * Teardown test database.
 * Closes the database connection. The database file will be deleted
 * in the next setupTestDb() call to ensure clean state.
 */
export function teardownTestDb(): void {
  // Close the database connection without reconnecting
  closeDatabase();

  // Reset DATABASE_URL
  delete process.env["DATABASE_URL"];

  // Don't delete the file here - let setupTestDb() handle it
  // This avoids "database is locked" errors when the connection
  // is still open or being used
}

/**
 * Get test database instance.
 * Returns the global db instance which should be using the test database.
 */
export function getTestDb() {
  return db;
}
