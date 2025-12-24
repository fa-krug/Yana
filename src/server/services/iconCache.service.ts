/**
 * Icon cache service.
 *
 * Local file system caching of icons.
 */

import * as fs from "fs";
import * as path from "path";

import { logger } from "../utils/logger";

const CACHE_DIR = process.env["ICON_CACHE_DIR"] || "./cache/icons";
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Ensure cache directory exists.
 */
function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Get cache file path for a URL.
 */
function getCacheFilePath(iconUrl: string): string {
  const urlHash = Buffer.from(iconUrl)
    .toString("base64")
    .replace(/[/+=]/g, "_");
  return path.join(CACHE_DIR, `${urlHash}.cache`);
}

/**
 * Get icon from cache.
 */
export function getCachedIcon(iconUrl: string): string | null {
  try {
    ensureCacheDir();
    const cachePath = getCacheFilePath(iconUrl);

    if (!fs.existsSync(cachePath)) {
      return null;
    }

    const stats = fs.statSync(cachePath);
    const age = Date.now() - stats.mtimeMs;

    if (age > CACHE_MAX_AGE) {
      // Cache expired
      fs.unlinkSync(cachePath);
      return null;
    }

    // Return cached URL (we store the URL, not the file)
    const cachedData = fs.readFileSync(cachePath, "utf-8");
    const data = JSON.parse(cachedData);
    return data.url || null;
  } catch (error) {
    logger.error({ error, iconUrl }, "Error reading icon cache");
    return null;
  }
}

/**
 * Cache icon URL.
 */
export function cacheIcon(iconUrl: string, cachedUrl: string): void {
  try {
    ensureCacheDir();
    const cachePath = getCacheFilePath(iconUrl);

    const data = {
      url: cachedUrl,
      cachedAt: new Date().toISOString(),
    };

    fs.writeFileSync(cachePath, JSON.stringify(data), "utf-8");
    logger.debug({ iconUrl, cachedUrl }, "Icon cached");
  } catch (error) {
    logger.error({ error, iconUrl }, "Error caching icon");
  }
}

/**
 * Clear expired cache entries.
 */
export function clearExpiredCache(): void {
  try {
    ensureCacheDir();

    const files = fs.readdirSync(CACHE_DIR);
    let cleared = 0;

    for (const file of files) {
      const filePath = path.join(CACHE_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        const age = Date.now() - stats.mtimeMs;

        if (age > CACHE_MAX_AGE) {
          fs.unlinkSync(filePath);
          cleared++;
        }
      } catch (error) {
        // Ignore errors for individual files
        logger.debug({ error, file }, "Error checking cache file");
      }
    }

    if (cleared > 0) {
      logger.info({ cleared }, "Expired cache entries cleared");
    }
  } catch (error) {
    logger.error({ error }, "Error clearing expired cache");
  }
}
