import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { LoginComponent } from './features/auth/login.component';
import { MainLayoutComponent } from './layouts/main-layout.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent,
  },
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        component: DashboardComponent,
      },
      {
        path: 'feeds',
        loadChildren: () => import('./features/feeds/feeds.routes').then(m => m.FEEDS_ROUTES),
      },
      {
        path: 'articles',
        loadChildren: () =>
          import('./features/articles/articles.routes').then(m => m.ARTICLES_ROUTES),
      },
      {
        path: 'settings',
        loadChildren: () =>
          import('./features/settings/settings.routes').then(m => m.SETTINGS_ROUTES),
      },
      {
        path: 'users',
        loadChildren: () => import('./features/users/users.routes').then(m => m.USERS_ROUTES),
      },
      {
        path: 'admin/tasks',
        loadChildren: () =>
          import('./features/admin-tasks/admin-tasks.routes').then(m => m.ADMIN_TASKS_ROUTES),
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
