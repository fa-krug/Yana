/**
 * Article actions service - allows keyboard shortcuts to trigger article actions.
 * Article components register their action handlers with this service.
 */

import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface ArticleActions {
  toggleRead?: () => void;
  toggleSaved?: () => void;
  toggleRawContent?: () => void;
  reloadArticle?: () => void;
  goBack?: () => void;
  navigateToPrevious?: () => void;
  navigateToNext?: () => void;
  openOriginal?: () => void;
  viewFeed?: () => void;
}

@Injectable({ providedIn: 'root' })
export class ArticleActionsService {
  private actionsSubject = new Subject<ArticleActions | null>();
  actions$ = this.actionsSubject.asObservable();

  private currentActions: ArticleActions | null = null;

  /**
   * Register article actions (called by article detail component)
   */
  registerActions(actions: ArticleActions): void {
    this.currentActions = actions;
    this.actionsSubject.next(actions);
  }

  /**
   * Unregister article actions (called when leaving article detail page)
   */
  unregisterActions(): void {
    this.currentActions = null;
    this.actionsSubject.next(null);
  }

  /**
   * Get current actions synchronously
   */
  getCurrentActions(): ArticleActions | null {
    return this.currentActions;
  }
}
