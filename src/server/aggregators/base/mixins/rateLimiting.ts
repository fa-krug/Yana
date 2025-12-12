/**
 * Rate limiting mixin for BaseAggregator.
 */

/**
 * Interface for aggregator with rate limiting functionality.
 */
export interface RateLimitingMixin {
  readonly id: string;
  readonly feed: { id: number } | null;
  readonly rateLimitDelay: number;
  readonly logger: any;
}

/**
 * Apply rate limiting before fetching.
 * Override for custom rate limiting logic.
 */
export async function applyRateLimiting(
  this: RateLimitingMixin,
): Promise<void> {
  const startTime = Date.now();
  this.logger.debug(
    {
      step: "fetchSourceData",
      subStep: "applyRateLimiting",
      aggregator: this.id,
      feedId: this.feed?.id,
      delay: this.rateLimitDelay,
    },
    "Applying rate limiting",
  );

  await new Promise((resolve) => setTimeout(resolve, this.rateLimitDelay));

  const elapsed = Date.now() - startTime;
  this.logger.debug(
    {
      step: "fetchSourceData",
      subStep: "applyRateLimiting",
      aggregator: this.id,
      feedId: this.feed?.id,
      elapsed,
    },
    "Rate limiting complete",
  );
}
