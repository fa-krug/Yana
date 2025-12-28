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
   * Determine initial value for a form control.
   */
  private getInitialValue(
    option: AggregatorDetail["options"][string] & { key: string },
    existingValues?: Record<string, unknown>,
  ): unknown {
    const rawValue = existingValues?.[option.key];
    const existingValue = rawValue != undefined && rawValue != null ? rawValue : option.default;

    if (option.type === "boolean") {
      return existingValue != undefined && existingValue != null ? Boolean(existingValue) : Boolean(option.default);
    }
    if (option.type === "integer" || option.type === "float") {
      return (existingValue as number) ?? null;
    }
    if (option.type === "choice") {
      return (existingValue as string) ?? (option.default as string) ?? null;
    }
    return (existingValue as string) ?? "";
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
      if (key.startsWith("option_")) formGroup.removeControl(key);
    });

    // Add option fields dynamically
    Object.entries(options).forEach(([key, option]) => {
      const fieldName = `option_${key}`;
      const validators = option.required ? [Validators.required] : [];
      
      if (option.widget === "json") {
        validators.push((control: AbstractControl) => {
          if (!control.value || control.value.trim() === "") return null;
          try { JSON.parse(control.value); return null; } catch { return { jsonInvalid: true }; }
        });
      }

      const initialValue = this.getInitialValue({ ...option, key }, existingValues);
      formGroup.addControl(fieldName, this.fb.control(initialValue, validators));
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
   * Convert raw form value to boolean.
   */
  private convertToBoolean(value: unknown): boolean {
    if (value === true || value === "true" || value === 1 || value === "1") return true;
    if (value === false || value === "false" || value === 0 || value === "0") return false;
    return Boolean(value);
  }

  /**
   * Convert raw form value to number.
   */
  private convertToNumber(value: unknown, type: string): number | null {
    if (value == null || value === "") return null;
    const num = type === "integer" ? parseInt(String(value), 10) : parseFloat(String(value));
    return isNaN(num) ? null : num;
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
      const control = formGroup.get(`option_${key}`);
      if (!control) return;

      const rawValue = control.value;
      const type = filteredOptions[key]?.type;

      if (type === "boolean") {
        aggregatorOptions[key] = this.convertToBoolean(rawValue);
      } else if (type === "integer" || type === "float") {
        const num = this.convertToNumber(rawValue, type);
        if (num !== null) aggregatorOptions[key] = num;
      } else if (rawValue != null && rawValue !== undefined && rawValue !== "") {
        aggregatorOptions[key] = rawValue;
      }
    });
    return aggregatorOptions;
  }
}
