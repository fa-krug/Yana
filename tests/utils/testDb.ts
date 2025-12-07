/**
 * Test database utilities.
 */

import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../../src/server/db/schema';

let testDb: Database.Database | null = null;
let testDrizzle: ReturnType<typeof drizzle> | null = null;
const TEST_DB_PATH = path.join(__dirname, '../test.db');

/**
 * Setup test database.
 */
export function setupTestDb(): ReturnType<typeof drizzle> {
  // Remove existing test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  // Create new database
  const sqlite = new Database(TEST_DB_PATH);
  const db = drizzle(sqlite, { schema });

  // Run migrations
  migrate(db, { migrationsFolder: path.join(__dirname, '../src/server/db/migrations') });

  testDb = sqlite;
  testDrizzle = db;

  return db;
}

/**
 * Teardown test database.
 */
export function teardownTestDb(): void {
  if (testDb) {
    testDb.close();
    testDb = null;
  }

  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  testDrizzle = null;
}

/**
 * Get test database instance.
 */
export function getTestDb(): ReturnType<typeof drizzle> {
  if (!testDrizzle) {
    return setupTestDb();
  }
  return testDrizzle;
}
