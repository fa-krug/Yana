/**
 * Article clone form component - allows cloning an article with a stepper interface.
 */

import {
  Component,
  OnInit,
  inject,
  signal,
  ChangeDetectionStrategy,
  ViewChild,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router, RouterModule } from "@angular/router";
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatStepperModule, MatStepper } from "@angular/material/stepper";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatNativeDateModule } from "@angular/material/core";
import { DomSanitizer, SafeHtml } from "@angular/platform-browser";
import { ArticleService } from "@app/core/services/article.service";
import { ArticleDetail } from "@app/core/models";

@Component({
  selector: "app-article-clone-form",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatStepperModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
  ],
  template: `
    <div class="article-clone-form-container container-sm">
      <mat-card>
        <mat-card-header>
          <mat-card-title>Clone Article</mat-card-title>
        </mat-card-header>

        <mat-card-content>
          @if (loadingArticle()) {
            <div class="state-center loading">
              <mat-spinner></mat-spinner>
              <p>Loading article...</p>
            </div>
          } @else if (error()) {
            <div class="state-center error">
              <mat-icon>error</mat-icon>
              <p>{{ error() }}</p>
              <button mat-raised-button color="primary" (click)="goBack()">
                Back
              </button>
            </div>
          } @else {
            <mat-stepper [linear]="true" #stepper>
              <mat-step [stepControl]="articleFormGroup">
                <ng-template matStepLabel>Article Details</ng-template>

                <h3>Article Information</h3>
                <p class="muted">Edit the article details before cloning.</p>

                <form [formGroup]="articleFormGroup">
                  <mat-form-field appearance="outline" class="full-width">
                    <mat-label>Title</mat-label>
                    <input matInput formControlName="name" required />
                    @if (articleFormGroup.get("name")?.hasError("required")) {
                      <mat-error>Title is required</mat-error>
                    }
                  </mat-form-field>

                  <mat-form-field appearance="outline" class="full-width">
                    <mat-label>URL</mat-label>
                    <input matInput formControlName="url" required />
                    @if (articleFormGroup.get("url")?.hasError("required")) {
                      <mat-error>URL is required</mat-error>
                    }
                    @if (articleFormGroup.get("url")?.hasError("pattern")) {
                      <mat-error>Please enter a valid URL</mat-error>
                    }
                  </mat-form-field>

                  <mat-form-field appearance="outline" class="full-width">
                    <mat-label>Date</mat-label>
                    <input
                      matInput
                      [matDatepicker]="picker"
                      formControlName="date"
                      required
                    />
                    <mat-datepicker-toggle
                      matIconSuffix
                      [for]="picker"
                    ></mat-datepicker-toggle>
                    <mat-datepicker #picker></mat-datepicker>
                    @if (articleFormGroup.get("date")?.hasError("required")) {
                      <mat-error>Date is required</mat-error>
                    }
                  </mat-form-field>

                  <mat-form-field appearance="outline" class="full-width">
                    <mat-label>Content (HTML)</mat-label>
                    <textarea
                      matInput
                      formControlName="content"
                      rows="10"
                      required
                    ></textarea>
                    @if (
                      articleFormGroup.get("content")?.hasError("required")
                    ) {
                      <mat-error>Content is required</mat-error>
                    }
                  </mat-form-field>
                </form>

                <div class="step-actions">
                  <button mat-button (click)="goBack()">Cancel</button>
                  <button
                    mat-raised-button
                    color="primary"
                    matStepperNext
                    [disabled]="!articleFormGroup.valid"
                  >
                    Next
                  </button>
                </div>
              </mat-step>

              <mat-step>
                <ng-template matStepLabel>Preview</ng-template>

                <h3>Preview</h3>
                <p class="muted">
                  Review the rendered preview of the article before creating it.
                </p>

                <div
                  class="preview-content"
                  [innerHTML]="getSafeContent()"
                ></div>

                <div class="step-actions">
                  <button mat-button matStepperPrevious>Back</button>
                  <button
                    mat-raised-button
                    color="primary"
                    (click)="onSave()"
                    [disabled]="creating()"
                  >
                    @if (creating()) {
                      <mat-spinner
                        diameter="20"
                        class="button-spinner"
                      ></mat-spinner>
                    }
                    Create Article
                  </button>
                </div>
              </mat-step>
            </mat-stepper>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .article-clone-form-container {
        padding: 24px;
      }

      mat-card {
        margin-bottom: 24px;
      }

      mat-card-title {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      mat-stepper {
        background: transparent;
      }

      h3 {
        margin: 0 0 24px 0;
        font-size: 1.5rem;
        font-weight: 500;
        color: var(--mat-sys-on-surface);
      }

      .muted {
        color: rgba(0, 0, 0, 0.6);
        font-size: 0.875rem;
        margin: 0 0 24px 0;
      }

      .full-width {
        width: 100%;
        margin-bottom: 20px;
      }

      .step-actions {
        display: flex;
        gap: 8px;
        margin-top: 24px;
        justify-content: flex-end;
      }

      .step-actions button {
        ::ng-deep .mdc-button__label {
          display: flex;
          align-items: center;
          gap: 8px;
        }
      }

      .button-spinner {
        display: inline-block;
        margin: 0;
      }

      .preview-content {
        margin-top: 24px;
        padding: 24px;
        background: rgba(0, 0, 0, 0.02);
        border-radius: 8px;
        border: 1px solid rgba(0, 0, 0, 0.12);
        line-height: 1.8;
        font-size: 16px;
        color: rgba(0, 0, 0, 0.87);
        overflow: hidden;
        word-wrap: break-word;
        overflow-wrap: break-word;
        max-width: 100%;
        width: 100%;
        box-sizing: border-box;
      }

      .preview-content :deep(img) {
        max-width: 100%;
        width: 100%;
        height: auto;
        display: block;
        margin: 24px auto;
        border-radius: 4px;
        box-sizing: border-box;
        object-fit: contain;
      }

      .preview-content :deep(pre) {
        background-color: #f5f5f5;
        padding: 16px;
        border-radius: 4px;
        overflow-x: auto;
        max-width: 100%;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }

      .preview-content :deep(code) {
        background-color: #f5f5f5;
        padding: 2px 6px;
        border-radius: 3px;
        font-family: "Courier New", monospace;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }

      .preview-content :deep(blockquote) {
        border-left: 4px solid #1976d2;
        padding-left: 16px;
        margin: 16px 0;
        color: rgba(0, 0, 0, 0.6);
        font-style: italic;
      }

      .preview-content :deep(a) {
        color: #1976d2;
        text-decoration: none;
        word-break: break-all;
      }

      .preview-content :deep(a:hover) {
        text-decoration: underline;
      }

      .state-center {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 20px;
        text-align: center;
      }

      .state-center.loading {
        padding: 40px 20px;
      }

      .state-center.error mat-icon {
        font-size: 64px;
        width: 64px;
        height: 64px;
        margin-bottom: 16px;
        color: #f44336;
      }

      .state-center.loading mat-spinner {
        margin-bottom: 16px;
      }

      @media (max-width: 600px) {
        .article-clone-form-container {
          padding: 0;
          padding-top: 8px;
          max-width: 100%;
        }

        mat-card {
          margin: 0;
          border-radius: 0;
        }

        mat-card-header {
          padding: 16px 16px 8px 16px !important;
        }

        mat-card-content {
          padding: 8px 16px 16px 16px !important;
        }

        mat-card-title {
          font-size: 1.25rem;
        }

        .step-actions {
          flex-direction: column-reverse;
          gap: 8px;
          margin-top: 16px;
        }

        .step-actions button {
          width: 100%;
        }

        .preview-content {
          padding: 16px;
          font-size: 15px;
        }
      }

      :host-context(.dark-theme) {
        .muted {
          color: rgba(255, 255, 255, 0.6) !important;
        }

        .preview-content {
          background: rgba(20, 20, 20, 0.8) !important;
          border-color: rgba(255, 255, 255, 0.1) !important;
          color: rgba(255, 255, 255, 0.9) !important;
        }

        .preview-content p,
        .preview-content div,
        .preview-content span {
          color: rgba(255, 255, 255, 0.9) !important;
        }

        .preview-content a,
        .preview-content :deep(a) {
          color: var(--mat-sys-primary) !important;
        }

        .preview-content :deep(blockquote) {
          border-left-color: var(--mat-sys-primary) !important;
        }
      }
    `,
  ],
})
export class ArticleCloneFormComponent implements OnInit {
  @ViewChild("stepper") stepper!: MatStepper;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly articleService = inject(ArticleService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly sanitizer = inject(DomSanitizer);

  readonly loadingArticle = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly creating = signal<boolean>(false);
  readonly originalArticle = signal<ArticleDetail | null>(null);

  articleFormGroup: FormGroup = this.fb.group({
    name: ["", [Validators.required]],
    url: ["", [Validators.required, Validators.pattern(/^https?:\/\/.+/)]],
    date: [new Date(), [Validators.required]],
    content: ["", [Validators.required]],
  });

  ngOnInit() {
    const articleId = Number(this.route.snapshot.params["id"]);
    if (!articleId) {
      this.error.set("Invalid article ID");
      this.loadingArticle.set(false);
      return;
    }

    this.articleService.getArticle(articleId).subscribe({
      next: (article) => {
        this.originalArticle.set(article);
        // Prefill form with article data
        this.articleFormGroup.patchValue({
          name: article.title || article.name || "",
          url: article.url || article.link || "",
          date: new Date(), // Current date/time
          content: article.content || "",
        });
        this.loadingArticle.set(false);
      },
      error: (err) => {
        this.error.set(err.message || "Failed to load article");
        this.loadingArticle.set(false);
      },
    });
  }

  protected getSafeContent(): SafeHtml {
    const content = this.articleFormGroup.get("content")?.value || "";
    const contentWithLazyImages = content.replace(
      /<img([^>]*?)>/gi,
      (match: string, attributes: string) => {
        if (/loading\s*=/i.test(attributes)) {
          return match;
        }
        return `<img${attributes} loading="lazy">`;
      },
    );

    if (contentWithLazyImages.includes("youtube-embed-container")) {
      return this.sanitizer.bypassSecurityTrustHtml(contentWithLazyImages);
    }

    return this.sanitizer.sanitize(1, contentWithLazyImages) || "";
  }

  protected onSave(): void {
    if (!this.articleFormGroup.valid) {
      return;
    }

    const originalArticle = this.originalArticle();
    if (!originalArticle) {
      return;
    }

    const formValue = this.articleFormGroup.value;
    this.creating.set(true);

    // Clone all fields from original article, but use form values for name, url, date, content
    const articleData = {
      feedId: originalArticle.feedId,
      name: formValue.name,
      url: formValue.url,
      date: formValue.date,
      content: formValue.content,
      thumbnailUrl: originalArticle.thumbnailUrl || null,
      mediaUrl: originalArticle.mediaUrl || null,
      duration: originalArticle.duration || null,
      viewCount: originalArticle.viewCount || null,
      mediaType: originalArticle.mediaType || null,
      author: originalArticle.author || null,
      externalId: originalArticle.externalId || null,
      score: originalArticle.score || null,
    };

    this.articleService.createArticle(articleData).subscribe({
      next: () => {
        this.snackBar.open("Article cloned successfully", "Close", {
          duration: 3000,
          panelClass: ["success-snackbar"],
        });
        this.router.navigate(["/articles"]);
      },
      error: (err) => {
        this.creating.set(false);
        this.snackBar.open(
          `Failed to clone article: ${err.message || "Unknown error"}`,
          "Close",
          {
            duration: 5000,
            panelClass: ["error-snackbar"],
          },
        );
      },
    });
  }

  protected goBack(): void {
    const originalArticle = this.originalArticle();
    if (originalArticle) {
      const feedId = originalArticle.feed?.id || originalArticle.feedId;
      if (feedId) {
        this.router.navigate([
          "/feeds",
          feedId,
          "articles",
          originalArticle.id,
        ]);
      } else {
        this.router.navigate(["/articles", originalArticle.id]);
      }
    } else {
      this.router.navigate(["/articles"]);
    }
  }
}
