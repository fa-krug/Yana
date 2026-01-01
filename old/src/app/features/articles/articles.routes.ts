/**
 * Routes for article viewing feature.
 */

import { Routes } from "@angular/router";

export const ARTICLES_ROUTES: Routes = [
  {
    path: "",
    loadComponent: () =>
      import("./article-list.component").then((m) => m.ArticleListComponent),
  },
  {
    path: ":id",
    loadComponent: () =>
      import("./article-detail.component").then(
        (m) => m.ArticleDetailComponent,
      ),
  },
  {
    path: ":id/clone",
    loadComponent: () =>
      import("./components/article-clone-form.component").then(
        (m) => m.ArticleCloneFormComponent,
      ),
  },
];
