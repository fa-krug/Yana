/**
 * Feed filters component - search and filter controls for feeds.
 */

import { CommonModule } from "@angular/common";
import { Component, inject, input } from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";

import { GroupService } from "@app/core/services/group.service";

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
        margin-bottom: 0;
        flex-wrap: wrap;
      }

      .search-field {
        flex: 1;
        min-width: 200px;
      }

      .filter-field {
        min-width: 150px;
      }

      @media (max-width: 600px) {
        .filters {
          flex-direction: column;
          padding: 16px;
        }

        .search-field,
        .filter-field {
          width: 100%;
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
