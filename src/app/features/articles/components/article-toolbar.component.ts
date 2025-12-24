/**
 * Article toolbar component - action buttons for article detail view.
 */

import { CommonModule } from "@angular/common";
import { Component, input, output } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import { MatTooltipModule } from "@angular/material/tooltip";
import { RouterModule } from "@angular/router";

import { ArticleDetail } from "@app/core/models";

@Component({
  selector: "app-article-toolbar",
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
  ],
  template: `
    <div class="article-toolbar">
      <div class="toolbar-left">
        @if (article().prevId) {
          <button
            mat-icon-button
            [routerLink]="getArticleRoute(article().prevId!)"
            matTooltip="Previous article"
            aria-label="Previous article"
          >
            <mat-icon>navigate_before</mat-icon>
          </button>
        }
        @if (article().nextId) {
          <button
            mat-icon-button
            [routerLink]="getArticleRoute(article().nextId!)"
            matTooltip="Next article"
            aria-label="Next article"
          >
            <mat-icon>navigate_next</mat-icon>
          </button>
        }
      </div>
      <div class="toolbar-right">
        <button
          mat-icon-button
          [color]="article().read ? 'primary' : ''"
          (click)="onToggleRead()"
          [matTooltip]="article().read ? 'Mark as unread' : 'Mark as read'"
          [attr.aria-label]="article().read ? 'Mark as unread' : 'Mark as read'"
          [attr.aria-pressed]="article().read"
        >
          <mat-icon>{{
            article().read ? "check_circle" : "radio_button_unchecked"
          }}</mat-icon>
        </button>
        <button
          mat-icon-button
          [color]="article().saved ? 'accent' : ''"
          (click)="onToggleSaved()"
          [matTooltip]="article().saved ? 'Unsave' : 'Save'"
          [attr.aria-label]="
            article().saved ? 'Unsave article' : 'Save article'
          "
          [attr.aria-pressed]="article().saved"
        >
          <mat-icon>{{
            article().saved ? "bookmark" : "bookmark_border"
          }}</mat-icon>
        </button>
        <button
          mat-icon-button
          [color]="showRawContent() ? 'primary' : ''"
          (click)="onToggleRawContent()"
          [matTooltip]="showRawContent() ? 'Show rendered' : 'Show raw HTML'"
          [attr.aria-label]="
            showRawContent() ? 'Show rendered content' : 'Show raw HTML'
          "
          [attr.aria-pressed]="showRawContent()"
        >
          <mat-icon>{{ showRawContent() ? "article" : "code" }}</mat-icon>
        </button>
        <button
          mat-icon-button
          (click)="onReloadArticle()"
          [disabled]="reloading()"
          matTooltip="Reload article"
          aria-label="Reload article"
          [attr.aria-busy]="reloading()"
        >
          <mat-icon [class.spinning]="reloading()">refresh</mat-icon>
        </button>
        <button
          mat-icon-button
          [matMenuTriggerFor]="menu"
          matTooltip="More"
          aria-label="More options"
        >
          <mat-icon>more_vert</mat-icon>
        </button>
        <mat-menu #menu="matMenu">
          @if (article().link) {
            <a mat-menu-item [href]="article().link" target="_blank">
              <mat-icon>open_in_new</mat-icon>
              <span>Open Original</span>
            </a>
          }
          @if (article().feed?.id) {
            <button mat-menu-item [routerLink]="['/feeds', article().feed!.id]">
              <mat-icon>rss_feed</mat-icon>
              <span>View Feed</span>
            </button>
          } @else if (article().feedId) {
            <button mat-menu-item [routerLink]="['/feeds', article().feedId]">
              <mat-icon>rss_feed</mat-icon>
              <span>View Feed</span>
            </button>
          }
          <button
            mat-menu-item
            [routerLink]="['/articles', article().id, 'clone']"
          >
            <mat-icon>content_copy</mat-icon>
            <span>Clone</span>
          </button>
          <button
            mat-menu-item
            (click)="onDeleteArticle()"
            class="delete-action"
          >
            <mat-icon>delete</mat-icon>
            <span>Delete</span>
          </button>
        </mat-menu>
      </div>
    </div>
  `,
  styles: [
    `
      .article-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 24px;
        margin: 24px auto 0 auto;
        max-width: 900px;
        width: 100%;
        box-sizing: border-box;
        background: rgba(255, 255, 255, 0.5);
        border: 1px solid rgba(0, 0, 0, 0.06);
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        position: sticky;
        top: 16px;
        z-index: 100;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        overflow-x: hidden;
        overflow-y: hidden;
      }

      .article-toolbar:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
        background: rgba(255, 255, 255, 0.8);
      }

      .toolbar-left,
      .toolbar-right {
        display: flex;
        gap: 4px;
        align-items: center;
      }

      .toolbar-left button,
      .toolbar-right button {
        transition: transform 0.2s ease;
      }

      .toolbar-left button:hover,
      .toolbar-right button:hover {
        transform: scale(1.1);
      }

      .spinning {
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }

      .delete-action {
        color: #f44336;
      }

      @media (max-width: 600px) {
        .article-toolbar {
          padding: 8px 12px;
          margin: 12px 0 0 0;
          border-radius: 0;
          flex-wrap: nowrap;
          gap: 4px;
        }

        .toolbar-left,
        .toolbar-right {
          flex-shrink: 0;
        }

        .toolbar-left button,
        .toolbar-right button {
          width: 40px;
          height: 40px;
          min-width: 40px;
          padding: 0;
        }
      }

      @media (max-width: 480px) {
        .article-toolbar {
          padding: 6px 8px;
          margin: 8px 0 0 0;
          border-radius: 0;
        }

        .toolbar-left button,
        .toolbar-right button {
          width: 36px;
          height: 36px;
          min-width: 36px;
        }
      }

      :host-context(.dark-theme) {
        .article-toolbar {
          background: rgba(30, 30, 30, 0.8) !important;
          border-color: rgba(255, 255, 255, 0.1) !important;
        }

        .article-toolbar:hover {
          background: rgba(40, 40, 40, 0.9) !important;
        }
      }
    `,
  ],
})
export class ArticleToolbarComponent {
  readonly article = input.required<ArticleDetail>();
  readonly showRawContent = input.required<boolean>();
  readonly reloading = input.required<boolean>();

  readonly toggleRead = output<void>();
  readonly toggleSaved = output<void>();
  readonly toggleRawContent = output<void>();
  readonly reloadArticle = output<void>();
  readonly deleteArticle = output<void>();

  protected getArticleRoute(articleId: number): string[] {
    const currentArticle = this.article();
    const feedId = currentArticle?.feed?.id || currentArticle?.feedId;
    if (feedId) {
      return ["/feeds", feedId.toString(), "articles", articleId.toString()];
    }
    return ["/articles", articleId.toString()];
  }

  protected onToggleRead(): void {
    this.toggleRead.emit();
  }

  protected onToggleSaved(): void {
    this.toggleSaved.emit();
  }

  protected onToggleRawContent(): void {
    this.toggleRawContent.emit();
  }

  protected onReloadArticle(): void {
    this.reloadArticle.emit();
  }

  protected onDeleteArticle(): void {
    this.deleteArticle.emit();
  }
}
