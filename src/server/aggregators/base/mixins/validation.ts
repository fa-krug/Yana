/**
 * Validation mixin for BaseAggregator.
 */

/**
 * Interface for aggregator with validation functionality.
 */
export interface ValidationMixin {
  readonly id: string;
  readonly feed: { id: number } | null;
  readonly logger: any;
}

/**
 * Validate feed identifier/configuration.
 * Override for custom validation.
 */
export async function validate(this: ValidationMixin): Promise<void> {
  const startTime = Date.now();
  this.logger.debug(
    {
      step: "validate",
      subStep: "start",
      aggregator: this.id,
      feedId: this.feed?.id,
    },
    "Validating feed",
  );

  if (!this.feed) {
    throw new Error("Feed not initialized");
  }

  const elapsed = Date.now() - startTime;
  this.logger.debug(
    {
      step: "validate",
      subStep: "complete",
      aggregator: this.id,
      feedId: this.feed?.id,
      elapsed,
    },
    "Validation complete",
  );
}
