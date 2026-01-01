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

import { BreakpointObserver } from "@angular/cdk/layout";
import { CommonModule } from "@angular/common";
import {
  Component,
  inject,
  ChangeDetectionStrategy,
  ViewChild,
  AfterViewInit,
  signal,
} from "@angular/core";
import { MatDividerModule } from "@angular/material/divider";
import { MatIconModule } from "@angular/material/icon";
import { MatListModule } from "@angular/material/list";
import { MatSidenavModule, MatSidenav } from "@angular/material/sidenav";
import { MatToolbarModule } from "@angular/material/toolbar";
import { RouterModule } from "@angular/router";

import { BreadcrumbComponent } from "@app/core/components/breadcrumb.component";
import { AuthService } from "@app/core/services/auth.service";

import { HeaderComponent } from "./header.component";

@Component({
  selector: "app-main-layout",
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
        min-height: 100vh !important;
        display: flex;
        flex-direction: column;
        position: relative !important;
        overflow: hidden !important;
      }

      .sidenav {
        width: 250px;
        z-index: 1000 !important;
      }

      ::ng-deep .sidenav-container.mat-drawer-container {
        min-height: 100vh !important;
        overflow: hidden !important;
        position: relative !important;
      }

      ::ng-deep .sidenav-container .mat-drawer {
        z-index: 1000 !important;
        position: fixed !important;
      }

      ::ng-deep .mat-drawer-backdrop {
        z-index: 999 !important;
      }

      ::ng-deep .sidenav mat-toolbar {
        z-index: 1000 !important;
        position: relative !important;
      }

      ::ng-deep .sidenav-container mat-sidenav-content {
        display: flex !important;
        flex-direction: column;
        height: 100vh !important;
        max-height: 100vh !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        position: relative !important;
        scrollbar-width: thin;
      }

      ::ng-deep .sidenav-container mat-sidenav-content::-webkit-scrollbar {
        width: 8px;
      }

      ::ng-deep
        .sidenav-container
        mat-sidenav-content::-webkit-scrollbar-track {
        background: transparent;
      }

      ::ng-deep
        .sidenav-container
        mat-sidenav-content::-webkit-scrollbar-thumb {
        background-color: rgba(0, 0, 0, 0.2);
        border-radius: 4px;
      }

      ::ng-deep
        .sidenav-container
        mat-sidenav-content::-webkit-scrollbar-thumb:hover {
        background-color: rgba(0, 0, 0, 0.3);
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

  @ViewChild("drawer") drawer!: MatSidenav;

  isMobile = signal(false);

  ngAfterViewInit() {
    // Check initial screen size
    this.updateMobileState();

    // Watch for breakpoint changes - use custom breakpoint for larger threshold
    // Sidebar will only show on screens wider than 1024px
    this.breakpointObserver.observe(["(max-width: 1024px)"]).subscribe(() => {
      this.updateMobileState();
    });
  }

  private updateMobileState() {
    // Sidebar shows on screens wider than 1024px
    // On smaller screens, use mobile menu button
    const isSmallScreen = this.breakpointObserver.isMatched(
      "(max-width: 1024px)",
    );
    const mobile = isSmallScreen;

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
