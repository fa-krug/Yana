/**
 * Routes for feed management feature.
 * Placeholder for lazy-loaded feed routes.
 */

import { Routes } from '@angular/router';

export const FEEDS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./feed-list.component').then(m => m.FeedListComponent),
  },
  {
    path: 'create',
    loadComponent: () => import('./feed-form.component').then(m => m.FeedFormComponent),
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./feed-form.component').then(m => m.FeedFormComponent),
  },
  {
    path: ':id',
    loadComponent: () => import('./feed-detail.component').then(m => m.FeedDetailComponent),
    children: [
      {
        path: 'articles/:articleId',
        loadComponent: () =>
          import('../articles/article-detail.component').then(m => m.ArticleDetailComponent),
      },
    ],
  },
];
