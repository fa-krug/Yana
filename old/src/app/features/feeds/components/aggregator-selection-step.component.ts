/**
 * Aggregator selection step component - step 1 of feed creation form.
 */

import { CommonModule } from "@angular/common";
import { Component, input, output } from "@angular/core";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatChipsModule } from "@angular/material/chips";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSelectModule } from "@angular/material/select";
import { MatStepperModule } from "@angular/material/stepper";

import { AggregatorService } from "@app/core/services/aggregator.service";

@Component({
  selector: "app-aggregator-selection-step",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatPaginatorModule,
    MatChipsModule,
    MatStepperModule,
  ],
  template: `
    <form [formGroup]="aggregatorFormGroup()">
      <ng-template matStepLabel>Select</ng-template>

      <h3>Choose Feed Type</h3>
      <p>Select how you want to aggregate content for this feed.</p>

      <div class="aggregator-filters">
        <mat-form-field appearance="outline" class="search-field">
          <mat-label>Search aggregators</mat-label>
          <input matInput [formControl]="searchControl()" />
          <mat-icon matPrefix>search</mat-icon>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Type</mat-label>
          <mat-select [formControl]="typeControl()">
            <mat-option [value]="null">All Types</mat-option>
            <mat-option value="managed">Managed</mat-option>
            <mat-option value="social">Social</mat-option>
            <mat-option value="custom">Custom</mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      @if (aggregatorService().loading()) {
        <div class="loading">
          <mat-spinner diameter="40"></mat-spinner>
          <p>Loading aggregators...</p>
        </div>
      } @else if (aggregatorService().paginatedAggregators().length === 0) {
        <div class="empty-state">
          <mat-icon>search_off</mat-icon>
          <p>No aggregators found</p>
          <p class="muted">Try adjusting your search or filters</p>
        </div>
      } @else {
        <div class="aggregator-grid">
          @for (
            agg of aggregatorService().paginatedAggregators();
            track agg.id
          ) {
            <mat-card
              class="aggregator-card"
              [class.selected]="
                aggregatorFormGroup().get('aggregatorType')?.value === agg.id
              "
              (click)="onSelectAggregator(agg.id)"
            >
              <mat-card-header>
                <div class="aggregator-icon">
                  @if (agg.icon && !imageErrors()[agg.id]) {
                    <img
                      [src]="agg.icon"
                      [alt]="agg.name"
                      class="aggregator-image"
                      (error)="onImageError(agg.id)"
                    />
                  }
                  @if (!agg.icon || imageErrors()[agg.id]) {
                    <mat-icon
                      [class]="'feed-icon ' + (agg.feedType || 'article')"
                    >
                      {{ getAggregatorIcon(agg.feedType || "article") }}
                    </mat-icon>
                  }
                </div>
                <div class="aggregator-header-content">
                  <mat-card-title>{{ agg.name }}</mat-card-title>
                  <mat-card-subtitle>{{ agg.id }}</mat-card-subtitle>
                </div>
              </mat-card-header>
              <mat-card-content>
                @if (agg.description) {
                  <p class="aggregator-description">{{ agg.description }}</p>
                }
                <mat-chip-set>
                  <mat-chip [class]="'type-' + agg.type">{{
                    agg.type
                  }}</mat-chip>
                  @if (agg.feedType) {
                    <mat-chip>{{ agg.feedType }}</mat-chip>
                  }
                </mat-chip-set>
                @if (agg.url) {
                  <p class="aggregator-url">
                    <mat-icon>link</mat-icon>
                    {{ agg.url }}
                  </p>
                }
              </mat-card-content>
              @if (
                aggregatorFormGroup().get("aggregatorType")?.value === agg.id
              ) {
                <mat-card-actions>
                  <button mat-button disabled>
                    <mat-icon>check_circle</mat-icon>
                    Selected
                  </button>
                </mat-card-actions>
              }
            </mat-card>
          }
        </div>

        <mat-paginator
          [length]="aggregatorService().totalCount()"
          [pageSize]="aggregatorService().pageSize()"
          [pageIndex]="aggregatorService().currentPage() - 1"
          [pageSizeOptions]="[6, 12, 24, 48]"
          (page)="onPageChange($event)"
          showFirstLastButtons
        >
        </mat-paginator>
      }

      <div class="step-actions">
        <button
          mat-raised-button
          color="primary"
          matStepperNext
          [disabled]="!aggregatorFormGroup().valid"
        >
          Next
        </button>
      </div>
    </form>
  `,
  styles: [
    `
      h3 {
        margin: 0 0 8px 0;
        font-size: 1.5rem;
        font-weight: 500;
      }

      p {
        margin: 0 0 24px 0;
        color: rgba(0, 0, 0, 0.7);
      }

      .aggregator-filters {
        display: flex;
        gap: 16px;
        margin-bottom: 24px;
        flex-wrap: wrap;
      }

      .search-field {
        flex: 1;
        min-width: 200px;
      }

      .filter-field {
        min-width: 150px;
      }

      .loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
        text-align: center;
        gap: 16px;
      }

      .loading mat-spinner {
        margin-bottom: 16px;
      }

      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
        text-align: center;
        gap: 16px;
      }

      .empty-state mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        opacity: 0.5;
      }

      .empty-state .muted {
        color: rgba(0, 0, 0, 0.5);
        font-size: 0.875rem;
      }

      .aggregator-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 16px;
        margin-bottom: 24px;
      }

      .aggregator-card {
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        border: 2px solid transparent;
      }

      .aggregator-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
      }

      .aggregator-card.selected {
        border-color: var(--mat-sys-primary);
        background: rgba(25, 118, 210, 0.05);
      }

      .aggregator-icon {
        width: 48px;
        height: 48px;
        margin-right: 12px;
        flex-shrink: 0;
      }

      .aggregator-image {
        width: 48px;
        height: 48px;
        object-fit: cover;
        border-radius: 8px;
      }

      .feed-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
      }

      .feed-icon.article {
        color: #1976d2;
      }

      .feed-icon.youtube {
        color: #ff0000;
      }

      .feed-icon.podcast {
        color: #9c27b0;
      }

      .feed-icon.reddit {
        color: #ff4500;
      }

      .aggregator-description {
        margin: 12px 0;
        color: rgba(0, 0, 0, 0.7);
        font-size: 0.875rem;
        line-height: 1.5;
      }

      .aggregator-url {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 12px 0 0 0;
        color: rgba(0, 0, 0, 0.6);
        font-size: 0.8125rem;
        word-break: break-all;
      }

      .aggregator-url mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }

      .type-managed {
        background-color: #4caf50 !important;
        color: white !important;
      }

      .type-social {
        background-color: #2196f3 !important;
        color: white !important;
      }

      .type-custom {
        background-color: #ff9800 !important;
        color: white !important;
      }

      .step-actions {
        display: flex;
        justify-content: flex-end;
        margin-top: 24px;
        gap: 12px;
      }

      @media (max-width: 600px) {
        .aggregator-grid {
          grid-template-columns: 1fr;
        }

        .aggregator-filters {
          flex-direction: column;
        }

        .search-field,
        .filter-field {
          width: 100%;
        }
      }
    `,
  ],
})
export class AggregatorSelectionStepComponent {
  readonly aggregatorFormGroup = input.required<FormGroup>();
  readonly aggregatorService = input.required<AggregatorService>();
  readonly searchControl = input.required<FormControl<string | null>>();
  readonly typeControl = input.required<FormControl<string | null>>();
  readonly imageErrors = input.required<Record<string, boolean>>();

  readonly aggregatorSelected = output<string>();
  readonly pageChange = output<PageEvent>();
  readonly imageError = output<string>();

  protected getAggregatorIcon(type: string): string {
    const icons: Record<string, string> = {
      article: "article",
      youtube: "play_circle",
      podcast: "podcast",
      reddit: "forum",
    };
    return icons[type] || "rss_feed";
  }

  protected onSelectAggregator(aggregatorId: string): void {
    this.aggregatorSelected.emit(aggregatorId);
  }

  protected onPageChange(event: PageEvent): void {
    this.pageChange.emit(event);
  }

  protected onImageError(aggregatorId: string): void {
    this.imageError.emit(aggregatorId);
  }
}
