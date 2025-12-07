/**
 * Theme service - manages dark/light theme.
 */

import { Injectable, signal, effect, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private platformId = inject(PLATFORM_ID);
  private themeSignal = signal<Theme>(this.getStoredTheme());

  readonly theme = this.themeSignal.asReadonly();
  readonly isDark = () => this.themeSignal() === 'dark';

  constructor() {
    // Only run in browser
    if (isPlatformBrowser(this.platformId)) {
      // Apply theme on initialization
      this.applyTheme(this.themeSignal());

      // Watch for theme changes and persist
      effect(() => {
        const theme = this.themeSignal();
        this.applyTheme(theme);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('theme', theme);
        }
      });
    }
  }

  /**
   * Toggle between light and dark theme
   */
  toggle(): void {
    this.themeSignal.set(this.isDark() ? 'light' : 'dark');
  }

  /**
   * Set specific theme
   */
  setTheme(theme: Theme): void {
    this.themeSignal.set(theme);
  }

  /**
   * Get stored theme from localStorage or system preference
   * Returns 'light' on server-side (SSR)
   */
  private getStoredTheme(): Theme {
    if (!isPlatformBrowser(this.platformId)) {
      return 'light'; // Default for SSR
    }

    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('theme') as Theme | null;
      if (stored) {
        return stored;
      }
    }

    // Check system preference
    if (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      return 'dark';
    }

    return 'light';
  }

  /**
   * Apply theme to document
   * Only works in browser
   */
  private applyTheme(theme: Theme): void {
    if (!isPlatformBrowser(this.platformId) || typeof document === 'undefined') {
      return;
    }

    const html = document.documentElement;
    if (theme === 'dark') {
      html.classList.add('dark-theme');
    } else {
      html.classList.remove('dark-theme');
    }
  }
}
