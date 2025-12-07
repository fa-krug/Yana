/**
 * Shared header component used across the application.
 */

import { Component, inject, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../core/services/auth.service';
import { ThemeService } from '../core/services/theme.service';
import { KeyboardShortcutsService } from '../core/services/keyboard-shortcuts.service';

@Component({
  selector: 'app-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatDividerModule,
    MatTooltipModule,
  ],
  template: `
    <mat-toolbar color="primary" [class]="toolbarClass()">
      @if (showMenuButton()) {
        <button mat-icon-button (click)="menuToggle.emit()" aria-label="Toggle menu">
          <mat-icon>menu</mat-icon>
        </button>
      }
      <img src="logo-wordmark.svg" alt="Yana" class="logo logo-wordmark" (click)="navigateToDashboard()" />
      <img src="logo-icon-only.svg" alt="Yana" class="logo logo-icon-only" (click)="navigateToDashboard()" />
      <span class="spacer"></span>

      <button
        mat-icon-button
        (click)="toggleTheme()"
        [matTooltip]="themeService.isDark() ? 'Switch to light mode' : 'Switch to dark mode'"
        [attr.aria-label]="themeService.isDark() ? 'Switch to light mode' : 'Switch to dark mode'"
      >
        <mat-icon>{{ themeService.isDark() ? 'light_mode' : 'dark_mode' }}</mat-icon>
      </button>

      @if (showKeyboardShortcutsButton()) {
        <button
          mat-icon-button
          (click)="onShowKeyboardShortcuts()"
          matTooltip="Keyboard shortcuts (?)"
          class="keyboard-shortcuts-btn"
          aria-label="Show keyboard shortcuts"
        >
          <mat-icon>keyboard</mat-icon>
        </button>
      }

      @if (showUserMenu() && authService.user(); as user) {
        <button
          mat-icon-button
          [matMenuTriggerFor]="userMenu"
          aria-label="User menu"
          matTooltip="User menu"
        >
          <mat-icon>account_circle</mat-icon>
        </button>
        <mat-menu #userMenu="matMenu">
          <div class="user-info" mat-menu-item disabled>
            <div class="user-name">{{ user.username }}</div>
            <div class="user-email">{{ user.email }}</div>
          </div>
          <mat-divider></mat-divider>
          <button mat-menu-item (click)="navigateToSettings()">
            <mat-icon>settings</mat-icon>
            <span>Settings</span>
          </button>
          <button mat-menu-item (click)="logout()">
            <mat-icon>logout</mat-icon>
            <span>Logout</span>
          </button>
        </mat-menu>
      }
    </mat-toolbar>
  `,
  styles: [
    `
      mat-toolbar {
        overflow: hidden;
        min-height: 48px;
        max-width: 100vw;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 1005;
        width: 100%;
      }

      .logo {
        flex-shrink: 0;
        cursor: pointer;
        margin-left: 4px;
      }

      .logo-wordmark {
        height: 40px;
        width: auto;
        margin-right: 12px;
        display: block;
      }

      .logo-icon-only {
        height: 32px;
        width: 32px;
        margin-right: 8px;
        display: none;
      }

      @media (max-width: 600px) {
        .logo-wordmark {
          display: none;
        }

        .logo-icon-only {
          display: block;
        }

        .keyboard-shortcuts-btn {
          display: none;
        }
      }

      .spacer {
        flex: 1 1 auto;
        min-width: 0;
      }

      button[mat-icon-button] {
        flex-shrink: 0;
      }

      .user-info {
        pointer-events: none;
      }

      .user-name {
        font-weight: 500;
      }

      .user-email {
        font-size: 12px;
        color: rgba(0, 0, 0, 0.6);
      }

      :host-context(.dark-theme) mat-icon {
        color: white !important;
      }

      :host-context(.dark-theme) button[mat-icon-button] mat-icon {
        color: white !important;
      }

      :host-context(.dark-theme) .user-email {
        color: rgba(255, 255, 255, 0.6) !important;
      }
    `,
  ],
})
export class HeaderComponent {
  authService = inject(AuthService);
  themeService = inject(ThemeService);
  private router = inject(Router);
  private keyboardShortcuts = inject(KeyboardShortcutsService);

  // Input properties to control header behavior
  showMenuButton = input<boolean>(false);
  showKeyboardShortcutsButton = input<boolean>(false);
  showUserMenu = input<boolean>(false);
  toolbarClass = input<string>('toolbar');
  menuToggle = output<void>();

  toggleTheme() {
    this.themeService.toggle();
  }

  onShowKeyboardShortcuts() {
    this.keyboardShortcuts.showHelp();
  }

  logout() {
    this.authService.logout().subscribe();
  }

  navigateToDashboard() {
    this.router.navigate(['/']);
  }

  navigateToSettings() {
    this.router.navigate(['/settings']);
  }
}
