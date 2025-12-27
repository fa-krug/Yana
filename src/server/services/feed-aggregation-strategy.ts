/**
 * Feed aggregation strategy with retry logic.
 *
 * Handles the retry loop for feed aggregation with exponential fallback.
 * Tries with increasing article limits to gracefully degrade quality vs speed.
 */

import type { RawArticle } from "../aggregators/base/types";

/**
 * Aggregate articles with retry strategy.
 * Tries with increasing article limits: [1, 5, 10, 25, 50]
 * Returns early on first successful aggregation.
 * Throws on timeout.
 */
export async function aggregateFeedWithRetry(
  aggregator: any, // BaseAggregator type
  timeoutMs: number = 120000,
): Promise<RawArticle[]> {
  const articleLimits = [1, 5, 10, 25, 50];
  const timeoutPromise = createTimeoutPromise(timeoutMs);

  for (const articleLimit of articleLimits) {
    try {
      const articles = await Promise.race([
        aggregator.aggregate(articleLimit),
        timeoutPromise,
      ]);

      // If we got articles, return them
      if (articles && articles.length > 0) {
        return articles.slice(0, 1);
      }
    } catch (error) {
      // If timeout, throw it (don't continue retrying)
      if (isTimeoutError(error)) {
        throw new Error(
          "Feed preview timed out after 2 minutes. The feed may be too slow or unavailable.",
        );
      }
      // Otherwise continue to next retry
    }
  }

  // All retries exhausted
  return [];
}

/**
 * Create a timeout promise that rejects after specified milliseconds.
 */
function createTimeoutPromise(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error("Feed preview timed out after 2 minutes"));
    }, ms);
  });
}

/**
 * Check if error is a timeout error.
 */
function isTimeoutError(error: unknown): boolean {
  const errorStr = String(error);
  return errorStr.includes("timed out");
}
