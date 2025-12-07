/**
 * Keyboard shortcuts service - manages global keyboard shortcuts.
 */

import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { HotkeysService } from '@ngneat/hotkeys';
import { KeyboardShortcutsDialogComponent } from '../../shared/components/keyboard-shortcuts-dialog.component';
import { ArticleActionsService } from './article-actions.service';

@Injectable({ providedIn: 'root' })
export class KeyboardShortcutsService {
  private hotkeys = inject(HotkeysService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private articleActions = inject(ArticleActionsService);

  /**
   * Initialize global keyboard shortcuts
   */
  init(): void {
    // Navigation shortcuts
    this.hotkeys
      .addShortcut({
        keys: 'g d',
        description: 'Go to Dashboard',
        preventDefault: true,
      })
      .subscribe(() => {
        this.router.navigate(['/']);
      });

    this.hotkeys
      .addShortcut({
        keys: 'g f',
        description: 'Go to Feeds',
        preventDefault: true,
      })
      .subscribe(() => {
        this.router.navigate(['/feeds']);
      });

    this.hotkeys
      .addShortcut({
        keys: 'c',
        description: 'Create Feed',
        preventDefault: true,
        allowIn: [],
      })
      .subscribe(() => {
        if (this.router.url.startsWith('/feeds') && !this.isArticlePage()) {
          this.router.navigate(['/feeds/create']);
        }
      });

    // Refresh shortcuts
    this.hotkeys
      .addShortcut({
        keys: 'r',
        description: 'Refresh current view',
        preventDefault: true,
        allowIn: [],
      })
      .subscribe(() => {
        window.location.reload();
      });

    // Article navigation shortcuts (only on article pages)
    this.hotkeys
      .addShortcut({
        keys: 'j',
        description: 'Next article',
        preventDefault: true,
        allowIn: [],
      })
      .subscribe(() => {
        if (this.isArticlePage()) {
          const actions = this.articleActions.getCurrentActions();
          actions?.navigateToNext?.();
        }
      });

    this.hotkeys
      .addShortcut({
        keys: 'k',
        description: 'Previous article',
        preventDefault: true,
        allowIn: [],
      })
      .subscribe(() => {
        if (this.isArticlePage()) {
          const actions = this.articleActions.getCurrentActions();
          actions?.navigateToPrevious?.();
        }
      });

    this.hotkeys
      .addShortcut({
        keys: 'ArrowRight',
        description: 'Next article',
        preventDefault: true,
        allowIn: [],
      })
      .subscribe(() => {
        if (this.isArticlePage()) {
          const actions = this.articleActions.getCurrentActions();
          actions?.navigateToNext?.();
        }
      });

    this.hotkeys
      .addShortcut({
        keys: 'ArrowLeft',
        description: 'Previous article',
        preventDefault: true,
        allowIn: [],
      })
      .subscribe(() => {
        if (this.isArticlePage()) {
          const actions = this.articleActions.getCurrentActions();
          actions?.navigateToPrevious?.();
        }
      });

    // Article action shortcuts
    this.hotkeys
      .addShortcut({
        keys: 'u',
        description: 'Toggle read/unread',
        preventDefault: true,
        allowIn: [],
      })
      .subscribe(() => {
        if (this.isArticlePage()) {
          const actions = this.articleActions.getCurrentActions();
          actions?.toggleRead?.();
        }
      });

    this.hotkeys
      .addShortcut({
        keys: 's',
        description: 'Toggle save/unsave',
        preventDefault: true,
        allowIn: [],
      })
      .subscribe(() => {
        if (this.isArticlePage()) {
          const actions = this.articleActions.getCurrentActions();
          actions?.toggleSaved?.();
        }
      });

    this.hotkeys
      .addShortcut({
        keys: 'v',
        description: 'Toggle raw HTML view',
        preventDefault: true,
        allowIn: [],
      })
      .subscribe(() => {
        if (this.isArticlePage()) {
          const actions = this.articleActions.getCurrentActions();
          actions?.toggleRawContent?.();
        }
      });

    this.hotkeys
      .addShortcut({
        keys: 'b',
        description: 'Go back',
        preventDefault: true,
        allowIn: [],
      })
      .subscribe(() => {
        if (this.isArticlePage()) {
          const actions = this.articleActions.getCurrentActions();
          actions?.goBack?.();
        }
      });

    this.hotkeys
      .addShortcut({
        keys: 'escape',
        description: 'Go back (on article page)',
        preventDefault: true,
        allowIn: [],
      })
      .subscribe(() => {
        if (this.isArticlePage()) {
          const actions = this.articleActions.getCurrentActions();
          actions?.goBack?.();
        }
      });

    this.hotkeys
      .addShortcut({
        keys: 'o',
        description: 'Open original link',
        preventDefault: true,
        allowIn: [],
      })
      .subscribe(() => {
        if (this.isArticlePage()) {
          const actions = this.articleActions.getCurrentActions();
          actions?.openOriginal?.();
        }
      });

    this.hotkeys
      .addShortcut({
        keys: 'g r',
        description: 'View feed (on article page)',
        preventDefault: true,
      })
      .subscribe(() => {
        if (this.isArticlePage()) {
          const actions = this.articleActions.getCurrentActions();
          actions?.viewFeed?.();
        }
      });

    // Help shortcut
    this.hotkeys
      .addShortcut({
        keys: '?',
        description: 'Show keyboard shortcuts',
        preventDefault: true,
      })
      .subscribe(() => {
        this.showHelp();
      });
  }

  /**
   * Check if current route is an article detail page
   */
  private isArticlePage(): boolean {
    const url = this.router.url;
    return url.includes('/articles/') || (url.includes('/feeds/') && url.includes('/articles/'));
  }

  /**
   * Show the keyboard shortcuts help dialog
   */
  showHelp(): void {
    this.dialog.open(KeyboardShortcutsDialogComponent, {
      width: '600px',
      maxWidth: '90vw',
    });
  }
}
