/**
 * Feed preview input validation.
 *
 * Validates user input for feed preview operations before processing.
 */

import { getAggregatorById } from "../aggregators/registry";
import type { FeedInsert } from "../db/types";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate feed preview input.
 * Checks for required fields and validates that aggregator exists.
 */
export function validateFeedPreviewInput(
  data: Partial<FeedInsert>,
): ValidationResult {
  // Check for aggregator
  if (!data.aggregator) {
    return {
      valid: false,
      error: "Aggregator is required",
    };
  }

  // Check for identifier
  if (!data.identifier) {
    return {
      valid: false,
      error: "Identifier is required",
    };
  }

  // Check if aggregator exists
  const aggregator = getAggregatorById(data.aggregator);
  if (!aggregator) {
    return {
      valid: false,
      error: `Aggregator '${data.aggregator}' not found`,
    };
  }

  return { valid: true };
}

/**
 * Get aggregator by ID, throwing if not found.
 * Used after validation has already confirmed it exists.
 */
export function getValidatedAggregator(aggregatorId: string) {
  const aggregator = getAggregatorById(aggregatorId);
  if (!aggregator) {
    throw new Error(`Aggregator '${aggregatorId}' not found`);
  }
  return aggregator;
}
