/**
 * Keyboard shortcuts help dialog component - displays all available keyboard shortcuts.
 */

import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';

interface Shortcut {
  keys: string;
  description: string;
  category: string;
}

@Component({
  selector: 'app-keyboard-shortcuts-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, CommonModule],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>keyboard</mat-icon>
      Keyboard Shortcuts
    </h2>
    <mat-dialog-content>
      <div class="shortcuts-container">
        @for (category of categories; track category) {
          <div class="shortcut-category">
            <h3>{{ category }}</h3>
            <div class="shortcuts-list">
              @for (shortcut of getShortcutsByCategory(category); track shortcut.keys) {
                <div class="shortcut-item">
                  <div class="shortcut-keys">
                    @for (key of formatKeys(shortcut.keys); track key) {
                      <kbd>{{ key }}</kbd>
                    }
                  </div>
                  <span class="shortcut-description">{{ shortcut.description }}</span>
                </div>
              }
            </div>
          </div>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-raised-button color="primary" [mat-dialog-close]="true" cdkFocusInitial>
        Close
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      h2 {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 0;
      }

      mat-icon {
        font-size: 28px;
        width: 28px;
        height: 28px;
      }

      .shortcuts-container {
        min-width: 500px;
        max-width: 600px;
      }

      .shortcut-category {
        margin-bottom: 24px;
      }

      .shortcut-category:last-child {
        margin-bottom: 0;
      }

      h3 {
        margin: 0 0 12px 0;
        font-size: 1rem;
        font-weight: 500;
        color: rgba(0, 0, 0, 0.87);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        font-size: 0.75rem;
      }

      .shortcuts-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .shortcut-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 8px 0;
      }

      .shortcut-keys {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
      }

      kbd {
        display: inline-block;
        padding: 4px 8px;
        font-size: 0.75rem;
        font-family: 'Courier New', 'Monaco', 'Menlo', monospace;
        font-weight: 600;
        line-height: 1.4;
        color: rgba(0, 0, 0, 0.87);
        background-color: #f5f5f5;
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 4px;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        min-width: 24px;
        text-align: center;
      }

      .shortcut-description {
        color: rgba(0, 0, 0, 0.7);
        font-size: 0.875rem;
        text-align: right;
        flex: 1;
      }

      :host-context(.dark-theme) h3 {
        color: rgba(255, 255, 255, 0.87);
      }

      :host-context(.dark-theme) kbd {
        background-color: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.2);
        color: rgba(255, 255, 255, 0.87);
      }

      :host-context(.dark-theme) .shortcut-description {
        color: rgba(255, 255, 255, 0.7);
      }

      @media (max-width: 600px) {
        .shortcuts-container {
          min-width: auto;
          max-width: 100%;
        }

        .shortcut-item {
          flex-direction: column;
          align-items: flex-start;
          gap: 8px;
        }

        .shortcut-description {
          text-align: left;
        }
      }
    `,
  ],
})
export class KeyboardShortcutsDialogComponent {
  dialogRef = inject(MatDialogRef<KeyboardShortcutsDialogComponent>);

  shortcuts: Shortcut[] = [
    // Navigation
    { keys: 'g d', description: 'Go to Dashboard', category: 'Navigation' },
    { keys: 'g f', description: 'Go to Feeds', category: 'Navigation' },
    { keys: 'g r', description: 'View Feed (on article page)', category: 'Navigation' },
    // Article Navigation
    { keys: 'j', description: 'Next article', category: 'Article Navigation' },
    { keys: 'k', description: 'Previous article', category: 'Article Navigation' },
    { keys: 'ArrowRight', description: 'Next article', category: 'Article Navigation' },
    { keys: 'ArrowLeft', description: 'Previous article', category: 'Article Navigation' },
    { keys: 'b', description: 'Go back', category: 'Article Navigation' },
    { keys: 'escape', description: 'Go back', category: 'Article Navigation' },
    // Article Actions
    { keys: 'u', description: 'Toggle read/unread', category: 'Article Actions' },
    { keys: 's', description: 'Toggle save/unsave', category: 'Article Actions' },
    { keys: 'v', description: 'Toggle raw HTML view', category: 'Article Actions' },
    { keys: 'o', description: 'Open original link', category: 'Article Actions' },
    // General Actions
    { keys: 'c', description: 'Create Feed (on Feeds page)', category: 'General Actions' },
    { keys: 'r', description: 'Refresh current view', category: 'General Actions' },
    // Help
    { keys: '?', description: 'Show keyboard shortcuts', category: 'Help' },
  ];

  categories = ['Navigation', 'Article Navigation', 'Article Actions', 'General Actions', 'Help'];

  getShortcutsByCategory(category: string): Shortcut[] {
    return this.shortcuts.filter(s => s.category === category);
  }

  formatKeys(keys: string): string[] {
    return keys.split(' ').map(key => {
      // Capitalize single letters
      if (key.length === 1) {
        return key.toUpperCase();
      }
      // Handle special keys
      const specialKeys: Record<string, string> = {
        shift: '⇧',
        ctrl: 'Ctrl',
        alt: 'Alt',
        meta: '⌘',
        enter: 'Enter',
        escape: 'Esc',
        backspace: '⌫',
        tab: '⇥',
        space: 'Space',
      };
      return specialKeys[key.toLowerCase()] || key;
    });
  }
}
