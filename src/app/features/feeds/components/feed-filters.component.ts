/**
 * Feed filters component - search and filter controls for feeds.
 */

import { Component, inject, input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatIconModule } from "@angular/material/icon";
import { GroupService } from "../../../core/services/group.service";

@Component({
  selector: "app-feed-filters",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
  ],
  template: `
    <div class="filters">
      <mat-form-field appearance="outline" class="search-field">
        <mat-label>Search feeds</mat-label>
        <input matInput [formControl]="searchControl()" />
        <mat-icon matPrefix>search</mat-icon>
      </mat-form-field>

      <mat-form-field appearance="outline" class="filter-field">
        <mat-label>Feed Type</mat-label>
        <mat-select [formControl]="typeControl()">
          <mat-option [value]="null">All Types</mat-option>
          <mat-option value="article">Articles</mat-option>
          <mat-option value="youtube">YouTube</mat-option>
          <mat-option value="podcast">Podcasts</mat-option>
          <mat-option value="reddit">Reddit</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="filter-field">
        <mat-label>Status</mat-label>
        <mat-select [formControl]="enabledControl()">
          <mat-option [value]="null">All</mat-option>
          <mat-option [value]="true">Enabled</mat-option>
          <mat-option [value]="false">Disabled</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="filter-field">
        <mat-label>Group</mat-label>
        <mat-select [formControl]="groupControl()">
          <mat-option [value]="null">All Groups</mat-option>
          @for (group of groupService.groups(); track group.id) {
            <mat-option [value]="group.id">{{ group.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </div>
  `,
  styles: [
    `
      .filters {
        display: flex;
        gap: 16px;
        margin-bottom: 16px;
        align-items: center;
        flex-wrap: wrap;
        padding: 12px;
        background: rgba(0, 0, 0, 0.02);
        border-radius: 12px;
        transition: background 0.2s ease;
      }

      .filters:hover {
        background: rgba(0, 0, 0, 0.04);
      }

      .search-field {
        flex: 1;
        min-width: 300px;
      }

      .filter-field {
        min-width: 150px;
      }

      @media (max-width: 600px) {
        .filters {
          flex-direction: row;
          align-items: stretch;
          padding: 16px 12px;
          width: 100%;
          box-sizing: border-box;
        }

        .search-field,
        .filter-field {
          flex: 1 1 0 !important;
          min-width: 0 !important;
          width: 0 !important;
          box-sizing: border-box;
        }

        .search-field ::ng-deep .mat-mdc-text-field-wrapper,
        .filter-field ::ng-deep .mat-mdc-text-field-wrapper {
          width: 100%;
        }
      }

      @media (max-width: 480px) {
        .filters {
          padding: 12px 8px;
          flex-direction: column;
          width: 100%;
          box-sizing: border-box;
        }

        .search-field,
        .filter-field {
          width: 100% !important;
          min-width: 0 !important;
          box-sizing: border-box;
        }

        .search-field ::ng-deep .mat-mdc-text-field-wrapper,
        .filter-field ::ng-deep .mat-mdc-text-field-wrapper {
          box-sizing: border-box;
        }
      }
    `,
  ],
})
export class FeedFiltersComponent {
  protected readonly groupService = inject(GroupService);

  readonly searchControl = input.required<FormControl<string | null>>();
  readonly typeControl = input.required<FormControl<string | null>>();
  readonly enabledControl = input.required<FormControl<boolean | null>>();
  readonly groupControl = input.required<FormControl<number | null>>();
}
