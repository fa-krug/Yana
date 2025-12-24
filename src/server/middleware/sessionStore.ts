/**
 * Custom SQLite session store for express-session.
 * Uses better-sqlite3 for persistent session storage.
 */

import Database from "better-sqlite3";
import session from "express-session";

import { logger } from "../utils/logger";

interface SessionRow {
  sid: string;
  sess: string;
  expire: number;
}

/**
 * SQLite session store implementation.
 */
export class SQLiteStore extends session.Store {
  private db: Database.Database;
  private tableName: string;

  constructor(options: {
    db: Database.Database;
    tableName?: string;
    skipTableCreation?: boolean;
  }) {
    super();
    this.db = options.db;
    this.tableName = options.tableName || "sessions";

    // Only create table if not managed by migrations
    if (!options.skipTableCreation) {
      this.initializeTable();
    } else {
      // Still clean up expired sessions
      this.cleanupExpiredSessions();
      logger.info(
        { tableName: this.tableName },
        "Session store initialized (table managed by migrations)",
      );
    }
  }

  /**
   * Initialize the sessions table.
   * Only used when table is not managed by migrations.
   */
  private initializeTable(): void {
    try {
      this.db
        .prepare(
          `CREATE TABLE IF NOT EXISTS ${this.tableName} (
          sid TEXT PRIMARY KEY,
          sess TEXT NOT NULL,
          expire INTEGER NOT NULL
        )`,
        )
        .run();

      // Create index on expire for efficient cleanup
      this.db
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_${this.tableName}_expire ON ${this.tableName}(expire)`,
        )
        .run();

      // Clean up expired sessions on initialization
      this.cleanupExpiredSessions();

      logger.info({ tableName: this.tableName }, "Session store initialized");
    } catch (error) {
      logger.error({ error }, "Failed to initialize session store");
      throw error;
    }
  }

  /**
   * Get session data.
   */
  override get(
    sid: string,
    callback: (
      err?: Error | null,
      session?: session.SessionData | null,
    ) => void,
  ): void {
    try {
      const stmt = this.db.prepare(
        `SELECT sess FROM ${this.tableName} WHERE sid = ? AND expire > ?`,
      );
      const row = stmt.get(sid, Date.now()) as { sess: string } | undefined;

      if (row) {
        const sessionData = JSON.parse(row.sess) as session.SessionData;
        callback(null, sessionData);
      } else {
        callback(null, null);
      }
    } catch (error) {
      logger.error(
        { error, sid, errorMessage: (error as Error).message },
        "Failed to get session",
      );
      callback(error as Error);
    }
  }

  /**
   * Set session data.
   */
  override set(
    sid: string,
    sessionData: session.SessionData,
    callback?: (err?: Error) => void,
  ): void {
    try {
      const expire = this.getExpireTime(sessionData.cookie);

      // Create a clean copy of session data, excluding non-serializable properties
      const cleanData: Record<string, unknown> = {};

      // Copy all enumerable properties
      for (const key in sessionData) {
        if (Object.prototype.hasOwnProperty.call(sessionData, key)) {
          const value = sessionData[key as keyof session.SessionData];

          // Skip functions and undefined
          if (typeof value === "function" || value === undefined) {
            continue;
          }

          // Handle Date objects
          if (value instanceof Date) {
            cleanData[key] = value.toISOString();
            continue;
          }

          // Try to serialize the value to check if it's serializable
          try {
            JSON.stringify(value);
            cleanData[key] = value;
          } catch (e) {
            // Skip non-serializable values
            logger.debug(
              { key, error: e },
              "Skipping non-serializable session property",
            );
          }
        }
      }

      // Always include cookie data (express-session needs it)
      if (sessionData.cookie) {
        cleanData["cookie"] = {
          originalMaxAge: sessionData.cookie.originalMaxAge,
          expires: sessionData.cookie.expires?.toISOString(),
          secure: sessionData.cookie.secure,
          httpOnly: sessionData.cookie.httpOnly,
          sameSite: sessionData.cookie.sameSite,
          path: sessionData.cookie.path,
        };
      }

      const sess = JSON.stringify(cleanData);

      const stmt = this.db.prepare(
        `INSERT OR REPLACE INTO ${this.tableName} (sid, sess, expire) VALUES (?, ?, ?)`,
      );
      stmt.run(sid, sess, expire);

      if (callback) {
        callback();
      }
    } catch (error) {
      const err = error as Error;
      logger.error(
        {
          error: err.message,
          stack: err.stack,
          sid,
          tableName: this.tableName,
        },
        "Failed to save session",
      );
      if (callback) {
        callback(err);
      }
    }
  }

  /**
   * Destroy session.
   */
  override destroy(sid: string, callback?: (err?: Error) => void): void {
    try {
      const stmt = this.db.prepare(
        `DELETE FROM ${this.tableName} WHERE sid = ?`,
      );
      stmt.run(sid);
      callback?.();
    } catch (error) {
      logger.error({ error, sid }, "Failed to destroy session");
      callback?.(error as Error);
    }
  }

  /**
   * Touch session (update expiration).
   */
  override touch(
    sid: string,
    sessionData: session.SessionData,
    callback?: (err?: Error) => void,
  ): void {
    try {
      const expire = this.getExpireTime(sessionData.cookie);
      const stmt = this.db.prepare(
        `UPDATE ${this.tableName} SET expire = ? WHERE sid = ?`,
      );
      const result = stmt.run(expire, sid);

      if (result.changes === 0) {
        // Session doesn't exist, create it
        this.set(sid, sessionData, callback);
      } else {
        callback?.();
      }
    } catch (error) {
      logger.error({ error, sid }, "Failed to touch session");
      callback?.(error as Error);
    }
  }

  /**
   * Get all sessions (optional, for debugging).
   */
  override all(
    callback: (
      err?: Error | null,
      sessions?: { [sid: string]: session.SessionData } | null,
    ) => void,
  ): void {
    try {
      const stmt = this.db.prepare(
        `SELECT sid, sess FROM ${this.tableName} WHERE expire > ?`,
      );
      const rows = stmt.all(Date.now()) as SessionRow[];

      const sessions: { [sid: string]: session.SessionData } = {};
      for (const row of rows) {
        sessions[row.sid] = JSON.parse(row.sess) as session.SessionData;
      }

      callback(null, sessions);
    } catch (error) {
      callback(error as Error);
    }
  }

  /**
   * Get count of all sessions.
   */
  override length(
    callback: (err?: Error | null, length?: number) => void,
  ): void {
    try {
      const stmt = this.db.prepare(
        `SELECT COUNT(*) as count FROM ${this.tableName} WHERE expire > ?`,
      );
      const row = stmt.get(Date.now()) as { count: number } | undefined;
      callback(null, row?.count || 0);
    } catch (error) {
      callback(error as Error);
    }
  }

  /**
   * Clear all sessions.
   */
  override clear(callback?: (err?: Error) => void): void {
    try {
      const stmt = this.db.prepare(`DELETE FROM ${this.tableName}`);
      stmt.run();
      callback?.();
    } catch (error) {
      callback?.(error as Error);
    }
  }

  /**
   * Clean up expired sessions.
   */
  private cleanupExpiredSessions(): void {
    try {
      const stmt = this.db.prepare(
        `DELETE FROM ${this.tableName} WHERE expire <= ?`,
      );
      const result = stmt.run(Date.now());
      if (result.changes > 0) {
        logger.debug(
          { deleted: result.changes },
          "Cleaned up expired sessions",
        );
      }
    } catch (error) {
      logger.warn({ error }, "Failed to cleanup expired sessions");
    }
  }

  /**
   * Calculate expiration time from cookie maxAge.
   */
  private getExpireTime(cookie: session.Cookie): number {
    if (cookie.maxAge) {
      return Date.now() + cookie.maxAge;
    }
    // Default to 2 weeks if no maxAge
    return Date.now() + 14 * 24 * 60 * 60 * 1000;
  }
}
