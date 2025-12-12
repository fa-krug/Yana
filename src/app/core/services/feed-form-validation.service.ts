/**
 * Service for feed form validation logic.
 */

import { Injectable } from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  FormControl,
  Validators,
  AbstractControl,
} from "@angular/forms";
import { AggregatorDetail } from "../models";

@Injectable({
  providedIn: "root",
})
export class FeedFormValidationService {
  constructor(private fb: FormBuilder) {}

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
      const existingValue = existingValues?.[key] ?? option.default;

      // Add JSON validation for json widget type
      if (option.widget === "json") {
        validators.push((control: AbstractControl) => {
          if (!control.value || control.value.trim() === "") {
            return null; // Empty is valid (will use default)
          }
          try {
            JSON.parse(control.value);
            return null;
          } catch (e) {
            return { jsonInvalid: true };
          }
        });
      }

      if (option.type === "boolean") {
        formGroup.addControl(
          fieldName,
          this.fb.control(existingValue ?? false),
        );
      } else if (option.type === "integer" || option.type === "float") {
        formGroup.addControl(
          fieldName,
          this.fb.control(existingValue ?? null, validators),
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
      const value = formGroup.get(fieldName)?.value;
      if (value !== null && value !== undefined && value !== "") {
        aggregatorOptions[key] = value;
      }
    });
    return aggregatorOptions;
  }
}
