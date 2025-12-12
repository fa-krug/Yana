/**
 * AI options component - displays AI-related configuration options.
 */

import { Component, input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormGroup, ReactiveFormsModule } from "@angular/forms";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatCheckboxModule } from "@angular/material/checkbox";

@Component({
  selector: "app-ai-options",
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
    @if (showAIOptions()) {
      <div class="ai-options-section">
        <h4>AI Features</h4>
        <p class="section-description">
          AI-powered content processing. Leave fields empty to disable. Order:
          Summarization → Translation → Custom Prompt.
        </p>

        <mat-checkbox [formControl]="aiSummarizeControl()">
          Generate AI summary
        </mat-checkbox>
        <p class="option-help-text">Generate AI summary of article content</p>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Translate to language</mat-label>
          <input
            matInput
            [formControl]="aiTranslateToControl()"
            maxlength="10"
          />
          <mat-hint
            >Target language code (e.g., 'en', 'de', 'es'). Leave empty to
            disable translation.</mat-hint
          >
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Custom AI prompt</mat-label>
          <textarea
            matInput
            [formControl]="aiCustomPromptControl()"
            [rows]="4"
            maxlength="500"
          ></textarea>
          <mat-hint
            >Custom AI prompt to process article content. Leave empty to
            disable.</mat-hint
          >
        </mat-form-field>
      </div>
    }
  `,
  styles: [
    `
      .ai-options-section {
        margin: 24px 0;
        padding: 16px;
        background: rgba(0, 0, 0, 0.02);
        border-radius: 8px;
      }

      .ai-options-section h4 {
        margin: 0 0 8px 0;
        font-size: 1.125rem;
        font-weight: 500;
      }

      .section-description {
        margin: 0 0 16px 0;
        color: rgba(0, 0, 0, 0.7);
        font-size: 0.875rem;
        line-height: 1.5;
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
export class AIOptionsComponent {
  readonly showAIOptions = input.required<boolean>();
  readonly aiSummarizeControl = input.required<any>();
  readonly aiTranslateToControl = input.required<any>();
  readonly aiCustomPromptControl = input.required<any>();
}
