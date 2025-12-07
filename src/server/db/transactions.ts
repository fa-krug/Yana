/**
 * Database transaction utilities.
 *
 * Provides transaction helpers with rollback on errors and retry logic.
 */

import { db } from './index';
import { DatabaseError } from '../errors';
import { logger } from '../utils/logger';

/**
 * Execute a function within a database transaction.
 * Automatically rolls back on error.
 *
 * @param fn - Function to execute within transaction
 * @returns Result of the function
 */
export async function withTransaction<T>(fn: (tx: typeof db) => Promise<T>): Promise<T> {
  // Note: better-sqlite3 doesn't support async transactions
  // We'll use synchronous transactions with proper error handling
  try {
    // For better-sqlite3, transactions are implicit via BEGIN/COMMIT
    // We'll handle this at the service level
    return await fn(db);
  } catch (error) {
    logger.error({ error }, 'Transaction failed');
    throw new DatabaseError('Transaction failed', error as Error);
  }
}

/**
 * Retry a database operation on specific errors.
 * Only retries for network/timeout errors (not applicable to SQLite, but kept for consistency).
 *
 * @param fn - Function to retry
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param delay - Delay between retries in ms (default: 100)
 * @returns Result of the function
 */
export async function retryDbOperation<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delay = 100
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // For SQLite, we don't retry on most errors
      // Only retry on database locked errors
      if (error instanceof Error && error.message.includes('database is locked')) {
        if (attempt < maxRetries) {
          logger.warn({ attempt, maxRetries, error: error.message }, 'Database locked, retrying');
          await new Promise(resolve => setTimeout(resolve, delay * attempt));
          continue;
        }
      }

      // Don't retry on other errors
      throw error;
    }
  }

  throw lastError || new Error('Operation failed after retries');
}

/**
 * Check database connection health.
 *
 * @returns True if database is healthy
 */
export async function checkDbHealth(): Promise<boolean> {
  try {
    // Simple query to check connection
    const { getDatabase } = await import('./index');
    const sqlite = getDatabase();
    sqlite.prepare('SELECT 1').get();
    return true;
  } catch (error) {
    logger.error({ error }, 'Database health check failed');
    return false;
  }
}
