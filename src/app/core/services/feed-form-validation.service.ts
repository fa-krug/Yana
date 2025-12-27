/**
 * Service for feed form validation logic.
 */

import { Injectable, inject } from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
} from "@angular/forms";

import { AggregatorDetail } from "../models";

@Injectable({
  providedIn: "root",
})
export class FeedFormValidationService {
  private fb = inject(FormBuilder);

  /**
   * Create the base feed form group.
   */
  createFeedFormGroup(): FormGroup {
    return this.fb.group({
      name: ["", Validators.required],
      identifier: ["", Validators.required],
      enabled: [true],
      generate_title_image: [true],
      add_source_footer: [true],
      skip_duplicates: [true],
      use_current_timestamp: [true],
      daily_post_limit: [50],
      ai_translate_to: [""],
      ai_summarize: [false],
      ai_custom_prompt: [""],
      groupIds: [[]],
    });
  }

  /**
   * Add aggregator option fields to form group.
   */
  addAggregatorOptions(
    formGroup: FormGroup,
    options: Record<string, AggregatorDetail["options"][string]>,
    existingValues?: Record<string, unknown>,
  ): void {
    // Clear existing option fields
    Object.keys(formGroup.controls).forEach((key) => {
      if (key.startsWith("option_")) {
        formGroup.removeControl(key);
      }
    });

    // Add option fields dynamically
    Object.entries(options).forEach(([key, option]) => {
      const fieldName = `option_${key}`;
      const validators = option.required ? [Validators.required] : [];
      // Handle null/undefined: if existingValues[key] is null or undefined, use default
      const rawValue = existingValues?.[key];
      const existingValue =
        rawValue != undefined && rawValue != null ? rawValue : option.default;

      // Add JSON validation for json widget type
      if (option.widget === "json") {
        validators.push((control: AbstractControl) => {
          if (!control.value || control.value.trim() === "") {
            return null; // Empty is valid (will use default)
          }
          try {
            JSON.parse(control.value);
            return null;
          } catch {
            return { jsonInvalid: true };
          }
        });
      }

      if (option.type === "boolean") {
        // For boolean options, use existing value if provided, otherwise use default
        // Important: if existingValue is explicitly false, use it (don't fall back to default)
        let initialValue = false;
        if (existingValue != undefined && existingValue != null) {
          initialValue = Boolean(existingValue);
        } else if (option.default != undefined) {
          initialValue = Boolean(option.default);
        }
        formGroup.addControl(fieldName, this.fb.control(initialValue));
      } else if (option.type === "integer" || option.type === "float") {
        formGroup.addControl(
          fieldName,
          this.fb.control(existingValue ?? null, validators),
        );
      } else if (option.type === "choice") {
        // For choice types, use null if no value (Material Select handles null better than empty string)
        // But prefer the default if available
        let initialValue = null;
        if (existingValue != undefined && existingValue != null) {
          initialValue = existingValue;
        } else if (option.default != undefined && option.default != null) {
          initialValue = option.default;
        }
        formGroup.addControl(
          fieldName,
          this.fb.control(initialValue, validators),
        );
      } else {
        formGroup.addControl(
          fieldName,
          this.fb.control(existingValue ?? "", validators),
        );
      }
    });
  }

  /**
   * Filter out restricted options for managed aggregators.
   */
  getFilteredOptions(
    detail: AggregatorDetail | null,
    isManaged: boolean,
  ): Record<string, AggregatorDetail["options"][string]> {
    if (!detail?.options) {
      return {};
    }

    // For managed aggregators, filter out restricted options
    if (isManaged) {
      const restrictedOptions = [
        "exclude_selectors",
        "ignore_content_contains",
        "ignore_title_contains",
        "regex_replacements",
      ];
      const filtered: Record<string, AggregatorDetail["options"][string]> = {};
      Object.entries(detail.options).forEach(([key, value]) => {
        if (!restrictedOptions.includes(key)) {
          filtered[key] = value;
        }
      });
      return filtered;
    }

    return detail.options;
  }

  /**
   * Collect aggregator options from form.
   */
  collectAggregatorOptions(
    formGroup: FormGroup,
    filteredOptions: Record<string, AggregatorDetail["options"][string]>,
  ): Record<string, unknown> {
    const aggregatorOptions: Record<string, unknown> = {};
    Object.keys(filteredOptions).forEach((key) => {
      const fieldName = `option_${key}`;
      const control = formGroup.get(fieldName);
      if (!control) {
        return;
      }
      // Get the raw value from the form control
      const rawValue = control.value;
      const optionType = filteredOptions[key]?.type;

      // For boolean options, always include the value (even if false)
      // Ensure it's a proper boolean value
      if (optionType === "boolean") {
        // Angular Material checkbox should return boolean, but handle edge cases
        // Convert to boolean: explicitly handle true/false values
        let boolValue: boolean;
        if (
          rawValue === true ||
          rawValue === "true" ||
          rawValue === 1 ||
          rawValue === "1"
        ) {
          boolValue = true;
        } else if (
          rawValue === false ||
          rawValue === "false" ||
          rawValue === 0 ||
          rawValue === "0"
        ) {
          boolValue = false;
        } else if (typeof rawValue === "boolean") {
          boolValue = rawValue;
        } else {
          // Fallback: convert to boolean using Boolean() constructor
          boolValue = Boolean(rawValue);
        }
        // Always include boolean values (both true and false)
        aggregatorOptions[key] = boolValue;
        return;
      }

      // For integer and float types, convert string values to numbers
      // HTML number inputs return strings, so we need to convert them
      if (optionType === "integer" || optionType === "float") {
        // Include 0 and negative numbers (like -1 for min_comments)
        if (rawValue != null && rawValue != undefined && rawValue != "") {
          let numValue: number;
          if (typeof rawValue === "number") {
            numValue = rawValue;
          } else if (optionType === "integer") {
            numValue = parseInt(String(rawValue), 10);
          } else {
            numValue = parseFloat(String(rawValue));
          }
          // Only include if conversion was successful (not NaN)
          if (!isNaN(numValue)) {
            aggregatorOptions[key] = numValue;
          }
        }
        return;
      }

      // For other types, exclude null, undefined, and empty strings
      if (rawValue != null && rawValue != undefined && rawValue != "") {
        aggregatorOptions[key] = rawValue;
      }
    });
    return aggregatorOptions;
  }
}
