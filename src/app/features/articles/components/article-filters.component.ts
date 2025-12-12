/**
 * Article filters component - search and filter controls for articles.
 */

import { Component, inject, input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatIconModule } from "@angular/material/icon";
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
    </div>
  `,
  styles: [
    `
      .filters {
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
}
