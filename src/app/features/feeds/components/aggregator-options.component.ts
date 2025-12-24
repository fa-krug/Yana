/**
 * Aggregator options component - displays dynamic aggregator-specific options.
 */

import { CommonModule } from "@angular/common";
import { Component, input } from "@angular/core";
import { FormGroup, ReactiveFormsModule } from "@angular/forms";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";

import { AggregatorOption } from "@app/core/models";

@Component({
  selector: "app-aggregator-options",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
  ],
  template: `
    @if (filteredOptions() && getObjectKeys(filteredOptions()).length > 0) {
      <div class="aggregator-options-section" [formGroup]="feedFormGroup()">
        <h4>Aggregator Options</h4>
        @for (
          optionEntry of getObjectEntries(filteredOptions());
          track optionEntry[0]
        ) {
          @let optionKey = optionEntry[0];
          @let option = optionEntry[1];
          @let fieldName = "option_" + optionKey;

          @if (feedFormGroup().get(fieldName) && option.type === "boolean") {
            <mat-checkbox [formControlName]="fieldName">
              {{ option.label }}
            </mat-checkbox>
            @if (option.helpText) {
              <p class="option-help-text">{{ option.helpText }}</p>
            }
          } @else if (
            feedFormGroup().get(fieldName) && option.type === "choice"
          ) {
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ option.label }}</mat-label>
              <mat-select [formControlName]="fieldName">
                @if (!option.required) {
                  <mat-option [value]="null">None</mat-option>
                }
                @for (choice of option.choices; track choice[0]) {
                  <mat-option [value]="choice[0]">{{ choice[1] }}</mat-option>
                }
              </mat-select>
              @if (option.helpText) {
                <mat-hint>{{ option.helpText }}</mat-hint>
              }
            </mat-form-field>
          } @else if (
            feedFormGroup().get(fieldName) && option.type === "password"
          ) {
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ option.label }}</mat-label>
              <input matInput type="password" [formControlName]="fieldName" />
              @if (option.helpText) {
                <mat-hint>{{ option.helpText }}</mat-hint>
              }
            </mat-form-field>
          } @else if (
            feedFormGroup().get(fieldName) &&
            (option.type === "integer" || option.type === "float")
          ) {
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ option.label }}</mat-label>
              <input
                matInput
                type="number"
                [formControlName]="fieldName"
                [attr.min]="option.min"
                [attr.max]="option.max"
                [step]="option.type === 'float' ? '0.01' : '1'"
              />
              @if (option.helpText) {
                <mat-hint>{{ option.helpText }}</mat-hint>
              }
            </mat-form-field>
          } @else if (feedFormGroup().get(fieldName)) {
            @let widgetType = option.widget || "text";
            @if (widgetType === "textarea") {
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ option.label }}</mat-label>
                <textarea
                  matInput
                  [formControlName]="fieldName"
                  [rows]="5"
                ></textarea>
                @if (option.helpText) {
                  <mat-hint>{{ option.helpText }}</mat-hint>
                }
              </mat-form-field>
            } @else {
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ option.label }}</mat-label>
                <input matInput [formControlName]="fieldName" />
                @if (option.helpText) {
                  <mat-hint>{{ option.helpText }}</mat-hint>
                }
              </mat-form-field>
            }
          }
        }
      </div>
    }
  `,
  styles: [
    `
      .aggregator-options-section {
        margin: 24px 0;
        padding: 16px;
        background: rgba(0, 0, 0, 0.02);
        border-radius: 8px;
      }

      .aggregator-options-section h4 {
        margin: 0 0 16px 0;
        font-size: 1.125rem;
        font-weight: 500;
      }

      .full-width {
        width: 100%;
        margin-bottom: 16px;
      }

      .option-help-text {
        margin: 4px 0 16px 0;
        color: rgba(0, 0, 0, 0.6);
        font-size: 0.875rem;
        line-height: 1.5;
      }

      mat-checkbox {
        display: block;
        margin-bottom: 8px;
      }
    `,
  ],
})
export class AggregatorOptionsComponent {
  readonly feedFormGroup = input.required<FormGroup>();
  readonly filteredOptions = input.required<Record<
    string,
    AggregatorOption
  > | null>();

  protected readonly Object = Object;

  protected getObjectKeys(
    obj: Record<string, AggregatorOption> | null,
  ): string[] {
    return obj ? Object.keys(obj) : [];
  }

  protected getObjectEntries(
    obj: Record<string, AggregatorOption> | null,
  ): [string, AggregatorOption][] {
    return obj ? Object.entries(obj) : [];
  }
}
