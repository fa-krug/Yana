/**
 * Aggregator service.
 *
 * Provides aggregator metadata and options.
 */

import type {
  AggregatorMetadata,
  OptionDefinition,
  OptionsSchema,
} from "../aggregators/base/types";
import {
  getAggregatorById,
  getAllAggregators,
  getAggregatorMetadata,
} from "../aggregators/registry";
import { NotFoundError } from "../errors";

import { getUserSettings } from "./userSettings.service";

/**
 * Get aggregator metadata.
 */
export function getAggregatorMetadataById(id: string): AggregatorMetadata {
  const metadata = getAggregatorMetadata(id);
  if (!metadata) {
    throw new NotFoundError(`Aggregator '${id}' not found`);
  }
  return metadata;
}

/**
 * Re-export getAggregatorMetadata for use in other services.
 */
export { getAggregatorMetadata };

/**
 * Get aggregator detail including identifier config and options.
 */
export function getAggregatorDetail(id: string): {
  id: string;
  identifier_type: string;
  identifier_label: string;
  identifier_description: string;
  identifier_placeholder: string;
  identifier_choices: Array<[string, string]> | null;
  identifier_editable: boolean;
  options: Record<string, unknown>;
  prefill_name?: boolean;
} {
  const aggregator = getAggregatorById(id);
  if (!aggregator) {
    // Return default values if aggregator not found
    return {
      id,
      identifier_type: "url",
      identifier_label: "Identifier",
      identifier_description: "",
      identifier_placeholder: "",
      identifier_choices: null,
      identifier_editable: false,
      options: {},
      prefill_name: true,
    };
  }

  const metadata = getAggregatorMetadata(id);

  // Convert options to format (list of lists for choices)
  const optionsDict: Record<string, unknown> = {};
  if (aggregator.options) {
    for (const [key, def] of Object.entries(aggregator.options)) {
      const optionDef: Record<string, unknown> = {
        type: def.type,
        label: def.label,
        help_text: def.helpText || "",
        default: def.default ?? null,
        required: def.required || false,
      };

      if (def.min !== undefined) {
        optionDef["min"] = def.min;
      }
      if (def.max !== undefined) {
        optionDef["max"] = def.max;
      }
      if (def.choices) {
        // Convert to list of lists format
        optionDef["choices"] = def.choices.map((c) => [
          String(c[0]),
          String(c[1]),
        ]);
      }
      if (def.widget) {
        optionDef["widget"] = def.widget;
      }

      optionsDict[key] = optionDef;
    }
  }

  return {
    id,
    identifier_type: metadata?.identifierType || "url",
    identifier_label: metadata?.identifierLabel || "Identifier",
    identifier_description: metadata?.identifierDescription || "",
    identifier_placeholder: metadata?.identifierPlaceholder || "",
    identifier_choices: metadata?.identifierChoices
      ? metadata.identifierChoices.map((c) => [String(c[0]), String(c[1])])
      : null,
    identifier_editable: metadata?.identifierEditable || false,
    options: optionsDict,
    prefill_name: metadata?.prefillName ?? true,
  };
}

/**
 * Get all aggregators, filtered by user settings if userId is provided.
 */
export async function getAllAggregatorMetadata(
  userId?: number,
): Promise<AggregatorMetadata[]> {
  const all = getAllAggregators();

  // If no user ID provided, return all aggregators
  if (!userId) {
    return all;
  }

  // Get user settings to filter aggregators
  try {
    const settings = await getUserSettings(userId);

    return all.filter((agg) => {
      // Filter YouTube aggregator based on user settings
      if (agg.id === "youtube") {
        return settings.youtubeEnabled && settings.youtubeApiKey.trim() !== "";
      }

      // Filter Reddit aggregator based on user settings
      if (agg.id === "reddit") {
        // Reddit can work with public API, but if user has credentials configured, require them to be enabled
        // For now, always show Reddit if user is authenticated (it uses public API)
        return true;
      }

      // All other aggregators are always available
      return true;
    });
  } catch {
    // If we can't get user settings, return all aggregators
    return all;
  }
}

/**
 * Get all aggregators grouped by type, filtered by user settings if userId is provided.
 */
export async function getGroupedAggregatorMetadata(userId?: number): Promise<{
  managed: AggregatorMetadata[];
  social: AggregatorMetadata[];
  custom: AggregatorMetadata[];
}> {
  const all = await getAllAggregatorMetadata(userId);
  return {
    managed: all.filter((a) => a.type === "managed"),
    social: all.filter((a) => a.type === "social"),
    custom: all.filter((a) => a.type === "custom"),
  };
}

/**
 * Get aggregator options schema.
 */
export function getAggregatorOptions(id: string): OptionsSchema | undefined {
  const aggregator = getAggregatorById(id);
  return aggregator?.options;
}

/**
 * Validate aggregator identifier.
 * Returns array of validation errors (empty if valid).
 */
function validateIdentifier(identifier: string): string[] {
  if (!identifier || identifier.trim() === "") {
    return ["Identifier is required"];
  }
  return [];
}

/**
 * Validate required option field.
 * Returns error message if validation fails, null otherwise.
 */
function validateOptionRequired(
  key: string,
  def: OptionDefinition,
  options: Record<string, unknown>,
): string | null {
  if (def.required && options[key] === undefined) {
    return `Option '${key}' is required`;
  }
  return null;
}

/**
 * Validate option value (type, min, max).
 * Returns array of validation errors (empty if valid).
 */
function validateOptionValue(
  key: string,
  def: OptionDefinition,
  value: unknown,
): string[] {
  const errors: string[] = [];

  // Type validation
  if (def.type === "integer" && typeof value !== "number") {
    errors.push(`Option '${key}' must be an integer`);
  } else if (def.type === "boolean" && typeof value !== "boolean") {
    errors.push(`Option '${key}' must be a boolean`);
  } else if (def.type === "string" && typeof value !== "string") {
    errors.push(`Option '${key}' must be a string`);
  }

  // Min validation
  if (
    def.min !== undefined &&
    typeof value === "number" &&
    value < def.min
  ) {
    errors.push(`Option '${key}' must be at least ${def.min}`);
  }

  // Max validation
  if (
    def.max !== undefined &&
    typeof value === "number" &&
    value > def.max
  ) {
    errors.push(`Option '${key}' must be at most ${def.max}`);
  }

  return errors;
}

/**
 * Validate aggregator configuration.
 */
export function validateAggregatorConfig(
  aggregatorId: string,
  identifier: string,
  options: Record<string, unknown> = {},
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check aggregator exists
  const aggregator = getAggregatorById(aggregatorId);
  if (!aggregator) {
    errors.push(`Aggregator '${aggregatorId}' not found`);
    return { valid: false, errors };
  }

  // Validate identifier
  errors.push(...validateIdentifier(identifier));

  // Validate options
  if (aggregator.options) {
    for (const [key, def] of Object.entries(aggregator.options)) {
      // Check required
      const requiredError = validateOptionRequired(key, def, options);
      if (requiredError) {
        errors.push(requiredError);
      }

      // Validate value if present
      if (options[key] !== undefined) {
        errors.push(...validateOptionValue(key, def, options[key]));
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
