/**
 * Article filters component - search and filter controls for articles.
 */

import { CommonModule } from "@angular/common";
import { Component, inject, input } from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { MatNativeDateModule } from "@angular/material/core";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";

import { FeedService } from "@app/core/services/feed.service";
import { GroupService } from "@app/core/services/group.service";

@Component({
  selector: "app-article-filters",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatDatepickerModule,
    MatNativeDateModule,
  ],
  template: `
    <div class="filters">
      <mat-form-field appearance="outline" class="search-field">
        <mat-label>Search articles</mat-label>
        <input matInput [formControl]="searchControl()" />
        <mat-icon matPrefix>search</mat-icon>
      </mat-form-field>

      <mat-form-field appearance="outline" class="filter-field">
        <mat-label>Feed</mat-label>
        <mat-select [formControl]="feedControl()">
          <mat-option [value]="null">All Feeds</mat-option>
          @for (feed of feedService.feeds(); track feed.id) {
            <mat-option [value]="feed.id">{{ feed.name }}</mat-option>
          }
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

      <mat-form-field appearance="outline" class="filter-field">
        <mat-label>Read State</mat-label>
        <mat-select [formControl]="readStateControl()">
          <mat-option [value]="null">All</mat-option>
          <mat-option value="unread">Unread</mat-option>
          <mat-option value="read">Read</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="filter-field date-field">
        <mat-label>From Date</mat-label>
        <input
          matInput
          [matDatepicker]="fromPicker"
          [formControl]="dateFromControl()"
          [max]="dateToControl().value || null"
        />
        <mat-datepicker-toggle
          matSuffix
          [for]="fromPicker"
        ></mat-datepicker-toggle>
        <mat-datepicker #fromPicker></mat-datepicker>
      </mat-form-field>

      <mat-form-field appearance="outline" class="filter-field date-field">
        <mat-label>To Date</mat-label>
        <input
          matInput
          [matDatepicker]="toPicker"
          [formControl]="dateToControl()"
          [min]="dateFromControl().value || null"
        />
        <mat-datepicker-toggle
          matSuffix
          [for]="toPicker"
        ></mat-datepicker-toggle>
        <mat-datepicker #toPicker></mat-datepicker>
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

      .date-field {
        min-width: 160px;
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
export class ArticleFiltersComponent {
  protected readonly feedService = inject(FeedService);
  protected readonly groupService = inject(GroupService);

  readonly searchControl = input.required<FormControl<string | null>>();
  readonly feedControl = input.required<FormControl<number | null>>();
  readonly groupControl = input.required<FormControl<number | null>>();
  readonly readStateControl =
    input.required<FormControl<"read" | "unread" | null>>();
  readonly dateFromControl = input.required<FormControl<Date | null>>();
  readonly dateToControl = input.required<FormControl<Date | null>>();
}
