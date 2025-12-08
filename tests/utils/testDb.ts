/**
 * Test database utilities.
 */

import * as path from "path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { reconnectDatabase, db, closeDatabase } from "../../src/server/db";

// Use in-memory database for tests to avoid file conflicts in parallel execution
// Each test gets its own isolated in-memory database
const TEST_DB_PATH = ":memory:";

/**
 * Setup test database.
 * Sets up a fresh test database and runs migrations.
 * Uses in-memory database to avoid file conflicts in parallel test execution.
 */
export function setupTestDb(): void {
  // Close any existing database connection first
  closeDatabase();

  // Set DATABASE_URL to in-memory database for tests
  // This ensures each test gets its own isolated database
  process.env["DATABASE_URL"] = TEST_DB_PATH;

  // Reconnect to use the test database
  // This will create a new connection to the in-memory database
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
