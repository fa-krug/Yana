/**
 * Breadcrumb component for displaying navigation hierarchy.
 *
 * @component
 * @standalone
 *
 * Features:
 * - Displays current navigation path
 * - Hides breadcrumbs on home page
 * - Responsive design with proper ARIA labels
 */

import { CommonModule } from "@angular/common";
import { Component, inject, ChangeDetectionStrategy } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { RouterModule } from "@angular/router";

import { BreadcrumbService } from "../services/breadcrumb.service";

@Component({
  selector: "app-breadcrumb",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, MatIconModule],
  template: `
    @if (shouldShowBreadcrumbs()) {
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <ol class="breadcrumb-list">
          @for (
            crumb of breadcrumbService.breadcrumbs();
            track crumb.label;
            let last = $last
          ) {
            <li class="breadcrumb-item">
              @if (last) {
                <span class="breadcrumb-current">{{ crumb.label }}</span>
              } @else {
                <a [routerLink]="crumb.url" class="breadcrumb-link">{{
                  crumb.label
                }}</a>
                <mat-icon class="breadcrumb-separator">chevron_right</mat-icon>
              }
            </li>
          }
        </ol>
      </nav>
    }
  `,
  styles: [
    `
      .breadcrumb {
        margin-bottom: 20px;
        padding: 12px 16px;
        background: var(--mat-sys-surface-variant, rgba(0, 0, 0, 0.05));
        border-radius: 8px;
        backdrop-filter: blur(10px);
      }

      .breadcrumb-list {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        list-style: none;
        padding: 0;
        margin: 0;
        gap: 2px;
      }

      .breadcrumb-item {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .breadcrumb-link {
        color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.6));
        text-decoration: none;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        font-size: 14px;
        font-weight: 400;
        padding: 4px 8px;
        border-radius: 4px;
        position: relative;
      }

      .breadcrumb-link:hover {
        color: var(--mat-sys-primary, #1976d2);
        background: var(
          --mat-sys-surface-container-highest,
          rgba(0, 0, 0, 0.04)
        );
        transform: translateY(-1px);
      }

      .breadcrumb-link:active {
        transform: translateY(0);
      }

      .breadcrumb-current {
        color: var(--mat-sys-on-surface, rgba(0, 0, 0, 0.87));
        font-size: 14px;
        font-weight: 500;
        padding: 4px 8px;
        border-radius: 4px;
        background: var(
          --mat-sys-surface-container-highest,
          rgba(0, 0, 0, 0.04)
        );
      }

      .breadcrumb-separator {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.4));
        margin: 0 4px;
        opacity: 0.6;
        transition: opacity 0.2s;
      }

      .breadcrumb-item:hover .breadcrumb-separator {
        opacity: 0.8;
      }

      @media (max-width: 600px) {
        .breadcrumb {
          padding: 6px 10px 10px 10px;
          margin-bottom: 0;
          margin-top: 10px;
          border-radius: 0;
        }

        .breadcrumb-link,
        .breadcrumb-current {
          font-size: 13px;
          padding: 3px 6px;
        }

        .breadcrumb-separator {
          font-size: 16px;
          width: 16px;
          height: 16px;
          margin: 0 2px;
        }
      }

      /* Dark theme specific adjustments */
      :host-context(.dark-theme) {
        .breadcrumb {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.12);
        }

        .breadcrumb-link {
          color: rgba(255, 255, 255, 0.87) !important;
        }

        .breadcrumb-link:hover {
          color: var(--mat-sys-primary) !important;
          background: rgba(255, 255, 255, 0.12);
        }

        .breadcrumb-current {
          color: rgba(255, 255, 255, 0.95) !important;
          background: rgba(255, 255, 255, 0.1);
        }

        .breadcrumb-separator {
          color: rgba(255, 255, 255, 0.7) !important;
          opacity: 0.8;
        }
      }
    `,
  ],
})
export class BreadcrumbComponent {
  breadcrumbService = inject(BreadcrumbService);

  shouldShowBreadcrumbs(): boolean {
    const breadcrumbs = this.breadcrumbService.breadcrumbs();
    // Hide breadcrumbs if only "Home" is shown (we're on the home page)
    return !(breadcrumbs.length === 1 && breadcrumbs[0].label === "Home");
  }
}
