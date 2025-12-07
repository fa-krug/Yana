/**
 * Main layout component with Material toolbar and sidenav.
 *
 * @component
 * @standalone
 *
 * Features:
 * - Responsive sidebar navigation
 * - Breadcrumb navigation
 * - Header with user menu and theme toggle
 * - Protected routes (requires authentication)
 */

import {
  Component,
  inject,
  ChangeDetectionStrategy,
  ViewChild,
  AfterViewInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { HeaderComponent } from './header.component';
import { AuthService } from '../core/services/auth.service';
import { BreadcrumbComponent } from '../core/components/breadcrumb.component';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    MatSidenavModule,
    MatListModule,
    MatDividerModule,
    MatToolbarModule,
    MatIconModule,
    HeaderComponent,
    BreadcrumbComponent,
  ],
  template: `
    <app-header
      [showMenuButton]="isMobile()"
      [showKeyboardShortcutsButton]="true"
      [showUserMenu]="true"
      toolbarClass="toolbar"
      (menuToggle)="drawer.toggle()"
    />
    <mat-sidenav-container class="sidenav-container">
      <mat-sidenav
        #drawer
        [mode]="isMobile() ? 'over' : 'side'"
        [opened]="!isMobile()"
        class="sidenav"
      >
        <mat-toolbar color="primary">
          <span class="menu-title">Menu</span>
        </mat-toolbar>
        <mat-nav-list>
          <a
            mat-list-item
            routerLink="/"
            (click)="isMobile() && drawer.close()"
            routerLinkActive="active"
            [routerLinkActiveOptions]="{ exact: true }"
          >
            <mat-icon matListItemIcon>dashboard</mat-icon>
            <span matListItemTitle>Dashboard</span>
          </a>
          <a
            mat-list-item
            routerLink="/feeds"
            (click)="isMobile() && drawer.close()"
            routerLinkActive="active"
          >
            <mat-icon matListItemIcon>rss_feed</mat-icon>
            <span matListItemTitle>Feeds</span>
          </a>
          <a
            mat-list-item
            routerLink="/articles"
            (click)="isMobile() && drawer.close()"
            routerLinkActive="active"
          >
            <mat-icon matListItemIcon>article</mat-icon>
            <span matListItemTitle>Articles</span>
          </a>
          @if (authService.isSuperuser()) {
            <mat-divider></mat-divider>
            <a
              mat-list-item
              routerLink="/users"
              (click)="isMobile() && drawer.close()"
              routerLinkActive="active"
            >
              <mat-icon matListItemIcon>people</mat-icon>
              <span matListItemTitle>Users</span>
            </a>
            <a
              mat-list-item
              routerLink="/admin/tasks"
              (click)="isMobile() && drawer.close()"
              routerLinkActive="active"
            >
              <mat-icon matListItemIcon>schedule</mat-icon>
              <span matListItemTitle>Background Tasks</span>
            </a>
          }
        </mat-nav-list>
      </mat-sidenav>

      <mat-sidenav-content>
        <div class="content-container">
          <app-breadcrumb></app-breadcrumb>
          <router-outlet></router-outlet>
        </div>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: [
    `
      .sidenav-container {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        overflow: visible !important;
        position: relative;
      }

      .sidenav {
        width: 250px;
        z-index: 1000 !important;
      }

      ::ng-deep .mat-drawer {
        z-index: 1000 !important;
      }

      ::ng-deep .mat-drawer-backdrop {
        z-index: 999 !important;
      }

      ::ng-deep .sidenav mat-toolbar {
        z-index: 1000 !important;
        position: relative !important;
      }

      mat-sidenav-content {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        overflow: visible !important;
        height: auto !important;
      }

      .content-container {
        padding: 16px;
        max-width: 1400px;
        margin: 64px auto 0 auto; /* Top margin to account for fixed header */
        width: 100%;
        box-sizing: border-box;
      }

      .active {
        background-color: rgba(0, 0, 0, 0.04);
      }

      .menu-title {
        font-size: 18px;
        font-weight: 500;
      }

      @media (max-width: 600px) {
        .content-container {
          padding: 0;
          margin-top: 56px; /* Smaller toolbar height on mobile */
        }
      }
    `,
  ],
})
export class MainLayoutComponent implements AfterViewInit {
  authService = inject(AuthService);
  private breakpointObserver = inject(BreakpointObserver);

  @ViewChild('drawer') drawer!: MatSidenav;

  isMobile = signal(false);

  ngAfterViewInit() {
    // Check initial screen size
    this.updateMobileState();

    // Watch for breakpoint changes
    this.breakpointObserver.observe([Breakpoints.Handset, Breakpoints.Tablet]).subscribe(() => {
      this.updateMobileState();
    });
  }

  private updateMobileState() {
    const isHandset = this.breakpointObserver.isMatched(Breakpoints.Handset);
    const isTablet = this.breakpointObserver.isMatched(Breakpoints.Tablet);
    const mobile = isHandset || isTablet;

    this.isMobile.set(mobile);

    // Ensure sidenav state matches screen size
    if (this.drawer) {
      if (!mobile) {
        this.drawer.open();
      } else {
        this.drawer.close();
      }
    }
  }
}
