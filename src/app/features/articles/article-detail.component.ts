/**
 * Article detail component - displays full article content with navigation.
 *
 * @component
 * @standalone
 *
 * Features:
 * - Displays article content with HTML sanitization
 * - Supports YouTube video and podcast media playback
 * - Provides read/saved state management
 * - Navigation between articles (previous/next)
 * - Raw HTML content view toggle
 * - Article deletion with confirmation dialog
 */

// Angular core
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  ChangeDetectionStrategy,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router, RouterModule } from "@angular/router";
import {
  DomSanitizer,
  SafeHtml,
  SafeResourceUrl,
} from "@angular/platform-browser";

// RxJS
import { switchMap, tap } from "rxjs";

// Angular Material
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";

// Application
import { ArticleService } from "../../core/services/article.service";
import { BreadcrumbService } from "../../core/services/breadcrumb.service";
import { ArticleActionsService } from "../../core/services/article-actions.service";
import { ArticleDetail } from "../../core/models";
import { ConfirmDialogComponent } from "../../shared/components/confirm-dialog.component";
import { ArticleToolbarComponent } from "./components/article-toolbar.component";
import { ArticleContentComponent } from "./components/article-content.component";

@Component({
  selector: "app-article-detail",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
    ArticleToolbarComponent,
    ArticleContentComponent,
  ],
  template: `
    <div class="article-detail-container container-md animate-fade-in">
      @if (loading()) {
        <div class="state-center loading" aria-live="polite" aria-busy="true">
          <mat-spinner aria-hidden="true"></mat-spinner>
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
      } @else if (article(); as currentArticle) {
        <app-article-toolbar
          [article]="currentArticle"
          [showRawContent]="showRawContent()"
          [reloading]="reloading()"
          (toggleRead)="toggleRead()"
          (toggleSaved)="toggleSaved()"
          (toggleRawContent)="toggleRawContent()"
          (reloadArticle)="reloadArticle()"
          (deleteArticle)="deleteArticle()"
        />

        <app-article-content
          [article]="currentArticle"
          [showRawContent]="showRawContent()"
        />

        <div class="article-navigation">
          @if (currentArticle.prevId) {
            <button
              mat-raised-button
              [routerLink]="getArticleRoute(currentArticle.prevId)"
            >
              <mat-icon>navigate_before</mat-icon>
              Previous Article
            </button>
          }
          <div class="spacer"></div>
          @if (currentArticle.nextId) {
            <button
              mat-raised-button
              [routerLink]="getArticleRoute(currentArticle.nextId)"
            >
              Next Article
              <mat-icon>navigate_next</mat-icon>
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .article-detail-container {
        padding: 0;
        overflow-x: hidden;
        max-width: 100%;
        width: 100%;
      }

      .article-navigation {
        display: flex;
        justify-content: space-between;
        max-width: 900px;
        width: 100%;
        box-sizing: border-box;
        margin: 24px auto;
        padding: 0 16px 24px;
        overflow-x: hidden;
        flex-wrap: wrap;
        gap: 8px;
      }

      .article-navigation .spacer {
        flex: 1;
      }

      @media (max-width: 600px) {
        .article-detail-container {
          padding: 0;
        }

        .article-navigation {
          margin: 12px 0 16px 0;
          padding: 0;
        }

        .article-navigation button {
          flex: 1;
          min-width: 0;
          font-size: 14px;
          padding: 8px 12px;
        }
      }

      @media (max-width: 480px) {
        .article-navigation {
          flex-direction: column;
          margin: 8px 0 12px 0;
        }

        .article-navigation .spacer {
          display: none;
        }

        .article-navigation button {
          width: 100%;
        }
      }
    `,
  ],
})
export class ArticleDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly articleService = inject(ArticleService);
  private readonly breadcrumbService = inject(BreadcrumbService);
  private readonly articleActions = inject(ArticleActionsService);

  protected readonly article = signal<ArticleDetail | null>(null);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly showRawContent = signal<boolean>(false);
  protected readonly reloading = signal<boolean>(false);

  ngOnInit() {
    this.route.params
      .pipe(
        switchMap((params) => {
          // Support both route structures: /articles/:id and /feeds/:feedId/articles/:articleId
          const articleId = Number(params["articleId"] || params["id"]);
          const feedIdParam = params["feedId"] || params["id"]; // For breadcrumb key
          const articleIdParam = params["articleId"] || params["id"]; // For breadcrumb key

          this.loading.set(true);
          this.error.set(null);
          return this.articleService.getArticle(articleId).pipe(
            tap((article) => {
              // Mark as read when viewing
              if (!article.isRead && !article.read) {
                this.articleService.markRead(article.id, true).subscribe();
              }

              // Redirect to new route structure if using old route
              if (!params["feedId"] && article.feedId) {
                this.router.navigate(
                  ["/feeds", article.feedId, "articles", article.id],
                  {
                    replaceUrl: true,
                  },
                );
                return;
              }

              // Set feed context for breadcrumb if article has a feed
              // Article breadcrumb is handled automatically by BreadcrumbService
              if (article.feed?.id) {
                const feedId = article.feed.id.toString();
                this.breadcrumbService.setLabel(
                  `id:${feedId}`,
                  article.feed.name,
                );
              } else if (article.feedId) {
                const feedId = article.feedId.toString();
                if (article.feedName) {
                  this.breadcrumbService.setLabel(
                    `id:${feedId}`,
                    article.feedName,
                  );
                }
              }
            }),
          );
        }),
      )
      .subscribe({
        next: (article) => {
          this.article.set(article);
          this.loading.set(false);
          // Register actions for keyboard shortcuts
          this.registerArticleActions();
        },
        error: (error) => {
          this.error.set(error.message || "Failed to load article");
          this.loading.set(false);
        },
      });
  }

  ngOnDestroy() {
    // Unregister article actions
    this.articleActions.unregisterActions();

    // Don't clear feed breadcrumb labels here. The feed detail component will
    // set the label when it loads, and will clear it when it's destroyed.
    // This prevents the label from disappearing when clicking the feed name
    // in breadcrumbs to navigate from article detail to feed detail.
  }

  /**
   * Register article actions for keyboard shortcuts
   */
  private registerArticleActions(): void {
    this.articleActions.registerActions({
      toggleRead: () => this.toggleRead(),
      toggleSaved: () => this.toggleSaved(),
      toggleRawContent: () => this.toggleRawContent(),
      reloadArticle: () => this.reloadArticle(),
      goBack: () => this.goBack(),
      navigateToPrevious: () => {
        const article = this.article();
        if (article?.prevId) {
          this.router.navigate(this.getArticleRoute(article.prevId));
        }
      },
      navigateToNext: () => {
        const article = this.article();
        if (article?.nextId) {
          this.router.navigate(this.getArticleRoute(article.nextId));
        }
      },
      openOriginal: () => {
        const article = this.article();
        if (article?.link) {
          window.open(article.link, "_blank");
        }
      },
      viewFeed: () => {
        const article = this.article();
        if (article?.feed?.id) {
          this.router.navigate(["/feeds", article.feed.id]);
        } else if (article?.feedId) {
          this.router.navigate(["/feeds", article.feedId]);
        }
      },
    });
  }

  protected getArticleRoute(articleId: number): string[] {
    const currentArticle = this.article();
    const feedId = currentArticle?.feed?.id || currentArticle?.feedId;
    if (feedId) {
      return ["/feeds", feedId.toString(), "articles", articleId.toString()];
    }
    return ["/articles", articleId.toString()];
  }

  protected toggleRawContent(): void {
    this.showRawContent.update((value) => !value);
  }

  protected toggleRead(): void {
    const article = this.article();
    if (!article) return;

    const currentRead = article.read ?? article.isRead ?? false;
    this.articleService.markRead(article.id, !currentRead).subscribe({
      next: () => {
        this.article.set({
          ...article,
          read: !currentRead,
          isRead: !currentRead,
        });
      },
      error: (error) => {
        this.snackBar.open(
          `Failed to update article: ${error.message}`,
          "Close",
          {
            duration: 3000,
          },
        );
      },
    });
  }

  toggleSaved() {
    const article = this.article();
    if (!article) return;

    const currentSaved = article.saved ?? article.isSaved ?? false;
    this.articleService.markSaved(article.id, !currentSaved).subscribe({
      next: () => {
        this.article.set({
          ...article,
          saved: !currentSaved,
          isSaved: !currentSaved,
        });
      },
      error: (error) => {
        this.snackBar.open(
          `Failed to update article: ${error.message}`,
          "Close",
          {
            duration: 3000,
          },
        );
      },
    });
  }

  protected deleteArticle(): void {
    const article = this.article();
    if (!article) return;

    const title = article.title || article.name || "this article";
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: "Delete Article",
        message: `Are you sure you want to delete "${title}"?`,
        confirmText: "Delete",
        cancelText: "Cancel",
        confirmColor: "warn",
      },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.articleService.deleteArticle(article.id).subscribe({
          next: () => {
            this.snackBar.open("Article deleted", "Close", {
              duration: 3000,
              panelClass: ["success-snackbar"],
            });
            this.goBack();
          },
          error: (error) => {
            this.snackBar.open(
              `Failed to delete article: ${error.message}`,
              "Close",
              {
                duration: 3000,
              },
            );
          },
        });
      }
    });
  }

  protected goBack(): void {
    const article = this.article();
    if (article?.feed?.id) {
      this.router.navigate(["/feeds", article.feed.id]);
    } else if (article?.feedId) {
      this.router.navigate(["/feeds", article.feedId]);
    } else {
      this.router.navigate(["/"]);
    }
  }

  protected reloadArticle(): void {
    const article = this.article();
    if (!article) return;

    this.reloading.set(true);
    this.articleService.refreshArticle(article.id).subscribe({
      next: (response) => {
        if (response.success && response.taskId) {
          // Poll for task completion
          this.articleService.pollTaskStatus(response.taskId).subscribe({
            next: (taskResult) => {
              if (taskResult.status === "completed") {
                // Task completed, fetch the updated article
                this.articleService.getArticle(article.id).subscribe({
                  next: (refreshedArticle) => {
                    this.article.set(refreshedArticle);
                    this.reloading.set(false);
                    this.snackBar.open(
                      "Article reloaded successfully",
                      "Close",
                      {
                        duration: 2000,
                        panelClass: ["success-snackbar"],
                      },
                    );
                  },
                  error: (error) => {
                    this.reloading.set(false);
                    this.snackBar.open(
                      `Failed to fetch reloaded article: ${error.message || "Unknown error"}`,
                      "Close",
                      { duration: 3000 },
                    );
                  },
                });
              } else if (taskResult.status === "failed") {
                // Task failed
                this.reloading.set(false);
                this.snackBar.open(
                  `Article reload failed: ${taskResult.error || "Unknown error"}`,
                  "Close",
                  { duration: 3000 },
                );
              }
            },
            error: (error) => {
              this.reloading.set(false);
              this.snackBar.open(
                `Failed to check reload status: ${error.message || "Unknown error"}`,
                "Close",
                { duration: 3000 },
              );
            },
          });
        } else {
          this.reloading.set(false);
          this.snackBar.open("Failed to start article refresh", "Close", {
            duration: 3000,
          });
        }
      },
      error: (error) => {
        this.reloading.set(false);
        this.snackBar.open(
          `Failed to refresh article: ${error.message || "Unknown error"}`,
          "Close",
          { duration: 3000 },
        );
      },
    });
  }
}
