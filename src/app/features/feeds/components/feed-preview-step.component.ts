/**
 * Feed preview step component - step 3 of feed creation form (preview).
 */

import { Component, inject, input, output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatStepperModule } from "@angular/material/stepper";
import { MatCardModule } from "@angular/material/card";
import { FeedPreviewResponse } from "../../../core/models";
import { PreviewArticleCardComponent } from "./preview-article-card.component";

@Component({
  selector: "app-feed-preview-step",
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatStepperModule,
    MatCardModule,
    PreviewArticleCardComponent,
  ],
  template: `
    <ng-template matStepLabel>Preview</ng-template>

    <h3>Test Feed Configuration</h3>
    <p class="muted">
      Preview the first article from this feed with full content to verify the
      configuration is correct.
    </p>

    @if (!previewResponse() || previewing()) {
      <div class="preview-loading">
        <mat-spinner diameter="40"></mat-spinner>
        <p>Fetching article...</p>
        <p class="muted">This may take up to a minute</p>
      </div>
    } @else if (!previewResponse()!.success) {
      <div class="preview-error">
        <mat-icon color="warn">error</mat-icon>
        <h4>Preview Failed</h4>
        <p class="error-message">{{ previewResponse()!.error }}</p>
        <div class="error-actions">
          <button
            mat-button
            color="primary"
            matStepperPrevious
            class="back-button"
          >
            Back
          </button>
          <button
            mat-raised-button
            color="accent"
            (click)="onPreviewFeed()"
            class="retry-button"
          >
            Try Again
          </button>
        </div>
      </div>
    } @else {
      <div class="preview-success">
        <div class="success-header">
          <mat-icon color="primary">check_circle</mat-icon>
          <p>Found article</p>
        </div>

        <div class="preview-articles">
          @for (article of previewResponse()!.articles; track article.link) {
            <app-preview-article-card [article]="article" />
          }
        </div>
      </div>
    }

    <div class="step-actions">
      <button mat-button matStepperPrevious>Back</button>
      <button
        mat-raised-button
        color="primary"
        (click)="onSubmitFeed()"
        [disabled]="creating() || !previewResponse()?.success"
      >
        @if (creating()) {
          <mat-spinner diameter="20" class="button-spinner"></mat-spinner>
        }
        {{ isEditMode() ? "Update Feed" : "Create Feed" }}
      </button>
    </div>
  `,
  styles: [
    `
      h3 {
        margin: 0 0 8px 0;
        font-size: 1.5rem;
        font-weight: 500;
      }

      .muted {
        color: rgba(0, 0, 0, 0.6);
        font-size: 0.875rem;
        margin: 0 0 24px 0;
      }

      .preview-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
        text-align: center;
        gap: 16px;
      }

      .preview-loading mat-spinner {
        margin-bottom: 16px;
      }

      .preview-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
        text-align: center;
        gap: 16px;
      }

      .preview-error mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
      }

      .preview-error h4 {
        margin: 16px 0 8px 0;
        font-size: 1.25rem;
        font-weight: 500;
      }

      .error-message {
        color: #f44336;
        margin: 0 0 24px 0;
      }

      .error-actions {
        display: flex;
        gap: 12px;
      }

      .preview-success {
        margin: 24px 0;
      }

      .success-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 24px;
        padding: 12px;
        background: rgba(76, 175, 80, 0.1);
        border-radius: 8px;
      }

      .success-header mat-icon {
        font-size: 24px;
        width: 24px;
        height: 24px;
      }

      .success-header p {
        margin: 0;
        font-weight: 500;
        color: #4caf50;
      }

      .preview-articles {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .step-actions {
        display: flex;
        justify-content: space-between;
        margin-top: 24px;
        gap: 12px;
      }

      .button-spinner {
        display: inline-block;
        margin-right: 8px;
      }
    `,
  ],
})
export class FeedPreviewStepComponent {
  readonly previewResponse = input.required<FeedPreviewResponse | null>();
  readonly previewing = input.required<boolean>();
  readonly creating = input.required<boolean>();
  readonly isEditMode = input.required<boolean>();

  readonly previewFeed = output<void>();
  readonly submitFeed = output<void>();

  protected onPreviewFeed(): void {
    this.previewFeed.emit();
  }

  protected onSubmitFeed(): void {
    this.submitFeed.emit();
  }
}
