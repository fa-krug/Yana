/**
 * Feed form component - multi-step form for creating and editing feeds.
 */

import { CommonModule } from "@angular/common";
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  ViewChild,
  ChangeDetectionStrategy,
} from "@angular/core";
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
// Material imports
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { PageEvent } from "@angular/material/paginator";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatStepper, MatStepperModule } from "@angular/material/stepper";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import { Router, RouterModule, ActivatedRoute } from "@angular/router";
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from "rxjs";

import {
  Aggregator,
  AggregatorDetail,
  FeedPreviewResponse,
  PreviewArticle,
  Group,
} from "@app/core/models";
import { AggregatorService } from "@app/core/services/aggregator.service";
import { BreadcrumbService } from "@app/core/services/breadcrumb.service";
import { FeedFormSearchService } from "@app/core/services/feed-form-search.service";
import { FeedFormValidationService } from "@app/core/services/feed-form-validation.service";
import { FeedService } from "@app/core/services/feed.service";
import { GroupService } from "@app/core/services/group.service";
import { UserSettingsService } from "@app/core/services/user-settings.service";

import { AggregatorSelectionStepComponent } from "./components/aggregator-selection-step.component";
import { FeedConfigStepComponent } from "./components/feed-config-step.component";
import { FeedPreviewStepComponent } from "./components/feed-preview-step.component";

@Component({
  selector: "app-feed-form",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatStepperModule,
    AggregatorSelectionStepComponent,
    FeedConfigStepComponent,
    FeedPreviewStepComponent,
  ],
  template: `
    <div class="feed-form-container container-sm">
      <mat-card>
        <mat-card-header>
          <mat-card-title>
            {{ isEditMode() ? "Edit Feed" : "Create New Feed" }}
          </mat-card-title>
        </mat-card-header>

        <mat-card-content>
          @if (loadingFeed()) {
            <div class="state-center loading">
              <mat-spinner></mat-spinner>
              <p>Loading feed...</p>
            </div>
          } @else if (aggregatorService.loading() && !isEditMode()) {
            <div class="state-center loading">
              <mat-spinner></mat-spinner>
              <p>Loading aggregators...</p>
            </div>
          } @else if (aggregatorService.error() && !isEditMode()) {
            <div class="state-center error">
              <mat-icon>error</mat-icon>
              <p>{{ aggregatorService.error() }}</p>
              <button
                mat-raised-button
                color="primary"
                (click)="loadAggregators()"
              >
                Retry
              </button>
            </div>
          } @else {
            <mat-stepper
              [linear]="true"
              #stepper
              (selectionChange)="onStepChange($event)"
            >
              @if (!isEditMode()) {
                <mat-step [stepControl]="aggregatorFormGroup">
                  <app-aggregator-selection-step
                    [aggregatorFormGroup]="aggregatorFormGroup"
                    [aggregatorService]="aggregatorService"
                    [searchControl]="searchControl"
                    [typeControl]="typeControl"
                    [imageErrors]="imageErrors"
                    (aggregatorSelected)="selectAggregator($event)"
                    (pageChange)="onPageChange($event)"
                    (imageError)="imageErrors[$event] = true"
                  />
                </mat-step>
              }

              <mat-step [stepControl]="feedFormGroup">
                <app-feed-config-step
                  [feedFormGroup]="feedFormGroup"
                  [aggregatorDetail]="aggregatorDetail()"
                  [selectedAggregator]="selectedAggregator()"
                  [identifierControl]="getIdentifierControl()"
                  [isIdentifierEditable]="isIdentifierEditable()"
                  [searchingSubreddits]="searchService.searchingSubreddits()"
                  [searchingChannels]="searchService.searchingChannels()"
                  [subredditSearchResults]="
                    searchService.subredditSearchResults()
                  "
                  [channelSearchResults]="searchService.channelSearchResults()"
                  [groupInputControl]="groupInputControl"
                  [selectedGroupIds]="selectedGroupIds()"
                  [filteredGroups]="filteredGroups()"
                  [creatingGroup]="creatingGroup()"
                  [allGroups]="groupService.groups()"
                  [filteredOptions]="getFilteredOptions()"
                  [showAIOptions]="
                    hasOpenAICredentials() && !isManagedAggregator()
                  "
                  [aiSummarizeControl]="aiSummarizeControl"
                  [aiTranslateToControl]="aiTranslateToControl"
                  [aiCustomPromptControl]="aiCustomPromptControl"
                  (subredditSearch)="onSubredditSearch($event)"
                  (subredditSelected)="onSubredditSelected($event)"
                  (channelSearch)="onChannelSearch($event)"
                  (channelSelected)="onChannelSelected($event)"
                  (groupSelected)="selectGroup($event)"
                  (groupRemoved)="removeGroup($event)"
                  (groupInputEnter)="handleGroupInputEnter($event)"
                  (createGroupFromInput)="createGroupFromInput()"
                />
              </mat-step>

              <mat-step>
                <app-feed-preview-step
                  [previewResponse]="previewResponse()"
                  [previewing]="previewing()"
                  [creating]="creating()"
                  [isEditMode]="isEditMode()"
                  (previewFeed)="previewFeed()"
                  (submitFeed)="createFeed()"
                />
              </mat-step>
            </mat-stepper>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .feed-form-container {
        padding: 24px;
      }

      mat-card {
        margin-bottom: 24px;
      }

      mat-card-title {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      mat-stepper {
        background: transparent;
      }

      h3 {
        margin: 0 0 24px 0;
        font-size: 1.5rem;
        font-weight: 500;
        color: var(--mat-sys-on-surface);
      }

      .full-width {
        width: 100%;
        margin-bottom: 20px;
      }

      mat-form-field {
        margin-top: 8px;
        margin-bottom: 20px;
      }

      mat-form-field.full-width {
        margin-top: 8px;
        margin-bottom: 20px;
      }

      .aggregator-filters {
        display: flex;
        gap: 8px;
        margin-bottom: 24px;
        flex-wrap: wrap;
      }

      .aggregator-filters mat-form-field {
        margin-bottom: 0;
      }

      .search-field {
        flex: 1;
        min-width: 300px;
      }

      .filter-field {
        flex: 1;
        min-width: 150px;
      }

      .aggregator-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 24px;
        margin-bottom: 32px;
      }

      .aggregator-card {
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        border: 2px solid var(--mat-sys-outline-variant);
        position: relative;
        border-radius: 16px;
        overflow: hidden;
        background: var(--mat-sys-surface);
        -webkit-tap-highlight-color: transparent;
        user-select: none;
      }

      .aggregator-card:active {
        transform: scale(0.98);
      }

      .aggregator-card:focus,
      .aggregator-card:focus-visible,
      .aggregator-card:focus-within {
        outline: none !important;
        box-shadow: none !important;
      }

      /* Prevent any blue outline or border on focus/active */
      ::ng-deep .aggregator-card.mat-mdc-card:focus,
      ::ng-deep .aggregator-card.mat-mdc-card:focus-visible,
      ::ng-deep .aggregator-card.mat-mdc-card:active {
        outline: none !important;
        box-shadow: none !important;
        border-color: var(--mat-sys-outline-variant) !important;
      }

      ::ng-deep .aggregator-card.mat-mdc-card:focus .mat-mdc-card-surface,
      ::ng-deep .aggregator-card.mat-mdc-card:active .mat-mdc-card-surface {
        outline: none !important;
        box-shadow: none !important;
      }

      /* Disable all ripple effects */
      ::ng-deep .aggregator-card.mat-mdc-card {
        --mdc-ripple-color: transparent !important;
        --mdc-ripple-hover-opacity: 0 !important;
        --mdc-ripple-press-opacity: 0 !important;
        --mdc-ripple-focus-opacity: 0 !important;
        -webkit-tap-highlight-color: transparent !important;
      }

      ::ng-deep .aggregator-card .mat-mdc-card-ripple {
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
      }

      ::ng-deep .aggregator-card .mdc-ripple-surface {
        --mdc-ripple-color: transparent !important;
        --mdc-ripple-hover-opacity: 0 !important;
        --mdc-ripple-press-opacity: 0 !important;
        --mdc-ripple-focus-opacity: 0 !important;
        background-color: transparent !important;
      }

      ::ng-deep .aggregator-card .mat-mdc-card-ripple::before,
      ::ng-deep .aggregator-card .mat-mdc-card-ripple::after,
      ::ng-deep .aggregator-card .mdc-ripple-surface::before,
      ::ng-deep .aggregator-card .mdc-ripple-surface::after {
        display: none !important;
        background-color: transparent !important;
        opacity: 0 !important;
        visibility: hidden !important;
      }

      ::ng-deep .aggregator-card .mdc-card__ripple {
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
      }

      /* Prevent any background color changes on interaction */
      ::ng-deep .aggregator-card.mat-mdc-card:hover .mdc-ripple-surface,
      ::ng-deep .aggregator-card.mat-mdc-card:active .mdc-ripple-surface,
      ::ng-deep .aggregator-card.mat-mdc-card:focus .mdc-ripple-surface {
        background-color: transparent !important;
      }

      /* Disable Material's focus indicator */
      ::ng-deep .aggregator-card .mdc-card__primary-action::before {
        display: none !important;
      }

      /* Prevent any blue background from appearing on click/tap */
      ::ng-deep .aggregator-card.mat-mdc-card:active,
      ::ng-deep .aggregator-card.mat-mdc-card:focus,
      ::ng-deep .aggregator-card.mat-mdc-card:focus-visible {
        background-color: var(--mat-sys-surface) !important;
      }

      ::ng-deep .aggregator-card.mat-mdc-card:active .mat-mdc-card-surface,
      ::ng-deep .aggregator-card.mat-mdc-card:focus .mat-mdc-card-surface {
        background-color: var(--mat-sys-surface) !important;
      }

      /* Override any Material theme colors that might show on interaction */
      ::ng-deep .aggregator-card.mat-mdc-card .mat-mdc-card-surface {
        background-color: var(--mat-sys-surface) !important;
      }

      ::ng-deep .aggregator-card.mat-mdc-card:active .mat-mdc-card-surface,
      ::ng-deep .aggregator-card.mat-mdc-card:focus .mat-mdc-card-surface,
      ::ng-deep
        .aggregator-card.mat-mdc-card:focus-visible
        .mat-mdc-card-surface {
        background-color: var(--mat-sys-surface) !important;
      }

      /* Prevent any blue color from appearing on non-selected cards during interaction */
      ::ng-deep
        .aggregator-card.mat-mdc-card:not(.selected)
        .mat-mdc-card-surface {
        background-color: var(--mat-sys-surface) !important;
      }

      ::ng-deep
        .aggregator-card.mat-mdc-card:not(.selected):active
        .mat-mdc-card-surface,
      ::ng-deep
        .aggregator-card.mat-mdc-card:not(.selected):focus
        .mat-mdc-card-surface {
        background-color: var(--mat-sys-surface) !important;
      }

      .aggregator-card:hover {
        transform: translateY(-6px);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
        border-color: var(--mat-sys-outline);
      }

      .aggregator-card.selected {
        border-color: var(--mat-sys-primary);
        background: linear-gradient(
          135deg,
          rgba(25, 118, 210, 0.08) 0%,
          rgba(25, 118, 210, 0.03) 100%
        );
        box-shadow: 0 8px 24px rgba(25, 118, 210, 0.2);
        transition: all 0.2s ease;
      }

      /* Prevent blue flash during click before selected state applies */
      .aggregator-card:not(.selected):active {
        background: var(--mat-sys-surface) !important;
      }

      .aggregator-card.selected::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 4px;
        background: linear-gradient(
          90deg,
          var(--mat-sys-primary),
          var(--mat-sys-primary-container)
        );
      }

      .aggregator-card mat-card-header {
        display: flex;
        flex-direction: row;
        align-items: center;
        padding: 24px 20px 16px 20px;
        background: linear-gradient(
          180deg,
          var(--mat-sys-surface-variant) 0%,
          transparent 100%
        );
        gap: 16px;
      }

      .aggregator-icon {
        width: 64px;
        height: 64px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        position: relative;
      }

      .aggregator-header-content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .aggregator-image {
        width: 64px;
        height: 64px;
        object-fit: cover;
        border-radius: 12px;
        transition: transform 0.3s ease;
        display: block;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }

      .aggregator-card:hover .aggregator-image {
        transform: scale(1.1);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      }

      .aggregator-icon .feed-icon {
        font-size: 64px;
        width: 64px;
        height: 64px;
        transition: transform 0.3s ease;
      }

      .aggregator-card:hover .aggregator-icon .feed-icon {
        transform: scale(1.1);
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

      .aggregator-card mat-card-title {
        font-size: 1.125rem !important;
        font-weight: 500 !important;
        margin: 0 0 4px 0 !important;
        color: var(--mat-sys-on-surface) !important;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .aggregator-card mat-card-subtitle {
        font-size: 0.75rem !important;
        opacity: 0.6;
        margin: 0 !important;
        font-family: monospace;
        color: var(--mat-sys-on-surface) !important;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .aggregator-card mat-card-content {
        padding: 0 20px 16px 20px;
      }

      .aggregator-description {
        color: var(--mat-sys-on-surface);
        opacity: 0.7;
        font-size: 0.875rem;
        margin: 12px 0;
        line-height: 1.5;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .aggregator-card mat-chip-set {
        margin: 12px 0;
      }

      .aggregator-card mat-chip {
        font-size: 0.75rem;
        font-weight: 500;
        height: 24px;
        padding: 0 10px;
      }

      .aggregator-card mat-chip.type-managed {
        background-color: #4caf50 !important;
        color: white !important;
      }

      .aggregator-card mat-chip.type-social {
        background-color: #ff9800 !important;
        color: white !important;
      }

      .aggregator-card mat-chip.type-custom {
        background-color: #2196f3 !important;
        color: white !important;
      }

      .aggregator-url {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--mat-sys-on-surface);
        opacity: 0.6;
        font-size: 0.75rem;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid var(--mat-sys-outline-variant);
        word-break: break-all;
      }

      .aggregator-url mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        opacity: 0.7;
        flex-shrink: 0;
      }

      .aggregator-card mat-card-actions {
        padding: 12px 20px 20px 20px !important;
        justify-content: center;
        background: linear-gradient(
          180deg,
          transparent 0%,
          var(--mat-sys-surface-variant) 100%
        );
      }

      .aggregator-card mat-card-actions button {
        color: var(--mat-sys-primary);
        font-weight: 600;
        font-size: 0.875rem;
      }

      .aggregator-card mat-card-actions mat-icon {
        margin-right: 6px;
        font-size: 20px;
        width: 20px;
        height: 20px;
      }

      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 20px;
        text-align: center;
      }

      .empty-state mat-icon {
        font-size: 64px;
        width: 64px;
        height: 64px;
        margin-bottom: 16px;
        opacity: 0.4;
      }

      .empty-state p {
        margin: 8px 0;
        font-size: 1rem;
      }

      .empty-state p.muted {
        color: var(--mat-sys-on-surface);
        opacity: 0.6;
        font-size: 0.875rem;
      }

      mat-paginator {
        margin-bottom: 24px;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.02);
      }

      @media (max-width: 600px) {
        .feed-form-container {
          padding: 0;
          padding-top: 8px;
          max-width: 100%;
        }

        mat-card {
          margin: 0;
          border-radius: 0;
        }

        mat-card-header {
          padding: 16px 16px 8px 16px !important;
        }

        mat-card-content {
          padding: 8px 16px 16px 16px !important;
        }

        mat-card-title {
          font-size: 1.25rem;
        }

        .loading,
        .error {
          padding: 40px 16px;
        }

        .loading mat-icon,
        .error mat-icon {
          font-size: 48px;
          width: 48px;
          height: 48px;
        }

        .aggregator-grid {
          grid-template-columns: 1fr;
          gap: 12px;
          margin-bottom: 20px;
        }

        .aggregator-filters {
          flex-direction: column;
          gap: 12px;
          margin-bottom: 16px;
        }

        .search-field,
        .filter-field {
          width: 100%;
          min-width: unset;
        }

        .aggregator-card mat-card-header {
          padding: 12px 8px 8px 8px;
        }

        .aggregator-card mat-card-content {
          padding: 0 8px 8px 8px;
        }

        .aggregator-card mat-card-actions {
          padding: 8px 8px 8px 8px !important;
        }

        h3 {
          font-size: 1.125rem;
          margin: 24px 0 8px 0;
        }

        h3 + p {
          margin-top: 0;
          margin-bottom: 16px;
        }

        .step-actions {
          flex-direction: column-reverse;
          gap: 8px;
          margin-top: 16px;
        }

        .step-actions button {
          width: 100%;
        }

        dl {
          grid-template-columns: 1fr;
          gap: 4px 8px;
        }

        mat-stepper {
          padding: 0;
        }

        ::ng-deep .mat-mdc-stepper-horizontal {
          padding: 0;
        }

        /* Enhanced mobile step highlighting */
        ::ng-deep .mat-step-header {
          position: relative;
          border-radius: 16px;
          transition: all 0.3s ease;
          padding: 12px 8px;
        }

        /* Prevent text truncation - allow text to wrap */
        ::ng-deep .mat-step-header .mat-step-text-label {
          white-space: normal !important;
          overflow: visible !important;
          text-overflow: clip !important;
          max-width: none !important;
        }

        /* Active step - prominent highlight */
        ::ng-deep .mat-step-header.mat-step-header-selected {
          background: rgba(
            var(--mat-sys-primary-rgb, 33, 150, 243),
            0.12
          ) !important;
          border: 1.5px solid var(--mat-sys-primary) !important;
          box-shadow: 0 2px 8px
            rgba(var(--mat-sys-primary-rgb, 33, 150, 243), 0.25) !important;
          padding: 10px 8px !important;
          margin: 0 -1.5px;
          border-radius: 20px !important;
        }

        /* Active step label text */
        ::ng-deep .mat-step-header.mat-step-header-selected .mat-step-label {
          color: var(--mat-sys-primary) !important;
          font-weight: 600 !important;
        }

        /* Active step icon/indicator */
        ::ng-deep .mat-step-header.mat-step-header-selected .mat-step-icon {
          background-color: var(--mat-sys-primary) !important;
          color: white !important;
          border: 1.5px solid var(--mat-sys-primary) !important;
          box-shadow: 0 2px 6px
            rgba(var(--mat-sys-primary-rgb, 33, 150, 243), 0.4) !important;
          transform: scale(1.08);
        }

        /* Completed steps - subtle highlight */
        ::ng-deep .mat-step-header.mat-step-header-completed {
          background: rgba(
            var(--mat-sys-primary-rgb, 33, 150, 243),
            0.05
          ) !important;
          border-radius: 16px;
        }

        /* Completed step icon */
        ::ng-deep .mat-step-header.mat-step-header-completed .mat-step-icon {
          background-color: var(--mat-sys-primary) !important;
          color: white !important;
        }

        /* Pending steps - muted */
        ::ng-deep
          .mat-step-header:not(.mat-step-header-selected):not(
            .mat-step-header-completed
          ) {
          opacity: 0.7;
        }

        /* Step label text improvements - ensure readability */
        ::ng-deep .mat-step-label {
          font-size: 0.875rem !important;
          font-weight: 500 !important;
          color: var(--mat-sys-on-surface, rgba(0, 0, 0, 0.87)) !important;
          opacity: 1 !important;
        }

        ::ng-deep .mat-step-header.mat-step-header-selected .mat-step-label {
          font-size: 0.875rem !important;
          color: var(--mat-sys-primary) !important;
          font-weight: 600 !important;
          opacity: 1 !important;
        }

        /* Completed step labels */
        ::ng-deep .mat-step-header.mat-step-header-completed .mat-step-label {
          color: var(--mat-sys-on-surface, rgba(0, 0, 0, 0.87)) !important;
          opacity: 0.9 !important;
        }

        /* Pending step labels - ensure they're readable */
        ::ng-deep
          .mat-step-header:not(.mat-step-header-selected):not(
            .mat-step-header-completed
          )
          .mat-step-label {
          color: var(--mat-sys-on-surface, rgba(0, 0, 0, 0.87)) !important;
          opacity: 0.75 !important;
        }

        /* Dark mode text improvements */
        :host-context(.dark-theme) ::ng-deep .mat-step-label {
          color: rgba(255, 255, 255, 0.87) !important;
        }

        :host-context(.dark-theme)
          ::ng-deep
          .mat-step-header.mat-step-header-selected
          .mat-step-label {
          color: #bbdefb !important;
        }

        :host-context(.dark-theme)
          ::ng-deep
          .mat-step-header.mat-step-header-completed
          .mat-step-label {
          color: rgba(255, 255, 255, 0.87) !important;
          opacity: 0.9 !important;
        }

        :host-context(.dark-theme)
          ::ng-deep
          .mat-step-header:not(.mat-step-header-selected):not(
            .mat-step-header-completed
          )
          .mat-step-label {
          color: rgba(255, 255, 255, 0.7) !important;
          opacity: 1 !important;
        }

        :host-context(.dark-theme) {
          .feed-icon.article {
            color: var(--mat-sys-primary) !important;
          }
        }

        /* Step icon size on mobile */
        ::ng-deep .mat-step-icon {
          width: 28px !important;
          height: 28px !important;
          font-size: 16px !important;
          transition: all 0.3s ease;
        }

        ::ng-deep .mat-step-header.mat-step-header-selected .mat-step-icon {
          width: 30px !important;
          height: 30px !important;
          font-size: 17px !important;
        }

        /* Step line/connector visibility */
        ::ng-deep
          .mat-step-header
          .mat-step-icon-state-edit
          .mat-step-icon-content {
          font-weight: 600;
        }

        ::ng-deep .mat-step-content {
          padding: 16px 0;
        }

        dt {
          grid-column: 1;
          font-weight: 600;
          margin-top: 8px;
        }

        dt:first-child {
          margin-top: 0;
        }

        dd {
          grid-column: 1;
          margin-bottom: 4px;
        }

        mat-paginator {
          margin-bottom: 16px;
        }

        .preview-prompt,
        .preview-loading,
        .preview-error {
          padding: 40px 16px;
        }

        .preview-prompt mat-icon,
        .preview-error mat-icon {
          font-size: 48px;
          width: 48px;
          height: 48px;
        }

        .preview-error .error-actions {
          flex-direction: column-reverse;
          width: 100%;
          gap: 12px;
        }

        .preview-error .error-actions button {
          width: 100%;
        }

        .preview-error .error-actions .back-button,
        .preview-error .error-actions .retry-button {
          justify-content: center;
        }

        .general-options-section,
        .aggregator-options-section,
        .ai-options-section {
          margin: 16px 0;
        }
      }

      .step-actions {
        display: flex;
        gap: 8px;
        margin-top: 24px;
        justify-content: flex-end;
      }

      .review-section {
        padding: 16px 0;
      }

      .review-section h4 {
        margin: 0 0 12px 0;
        color: rgba(0, 0, 0, 0.87);
      }

      .review-section p.muted {
        color: rgba(0, 0, 0, 0.6);
        font-size: 14px;
      }

      dl {
        display: grid;
        grid-template-columns: 150px 1fr;
        gap: 8px;
        margin: 0;
      }

      dt {
        font-weight: 500;
        color: rgba(0, 0, 0, 0.6);
      }

      dd {
        margin: 0;
        color: rgba(0, 0, 0, 0.87);
        word-break: break-word;
      }

      mat-divider {
        margin: 16px 0;
      }

      .general-options-section {
        margin-top: 32px;
        padding-top: 24px;
        border-top: 1px solid var(--mat-sys-outline-variant);
      }

      .general-options-section h4 {
        margin: 0 0 20px 0;
        font-size: 1.125rem;
        font-weight: 500;
        color: var(--mat-sys-on-surface);
      }

      .general-options-section mat-checkbox {
        display: block;
        margin: 16px 0 4px 0;
      }

      .general-options-section .option-help-text {
        margin: 0 0 20px 30px;
        font-size: 0.875rem;
        color: var(--mat-sys-on-surface);
        opacity: 0.6;
        line-height: 1.4;
      }

      .aggregator-options-section {
        margin-top: 32px;
        padding-top: 24px;
        border-top: 1px solid var(--mat-sys-outline-variant);
      }

      .aggregator-options-section h4 {
        margin: 0 0 20px 0;
        font-size: 1.125rem;
        font-weight: 500;
        color: var(--mat-sys-on-surface);
      }

      .aggregator-options-section mat-checkbox {
        display: block;
        margin: 16px 0 4px 0;
      }

      .aggregator-options-section .option-help-text {
        margin: 0 0 20px 30px;
        font-size: 0.875rem;
        color: var(--mat-sys-on-surface);
        opacity: 0.6;
        line-height: 1.4;
      }

      .aggregator-options-section mat-form-field {
        margin-bottom: 20px;
      }

      .ai-options-section {
        margin-top: 32px;
        padding-top: 24px;
        border-top: 1px solid var(--mat-sys-outline-variant);
      }

      .ai-options-section h4 {
        margin: 0 0 12px 0;
        font-size: 1.125rem;
        font-weight: 500;
        color: var(--mat-sys-on-surface);
      }

      .ai-options-section .section-description {
        margin: 0 0 20px 0;
        font-size: 0.875rem;
        color: var(--mat-sys-on-surface);
        opacity: 0.7;
        line-height: 1.4;
      }

      .ai-options-section mat-checkbox {
        display: block;
        margin: 16px 0 4px 0;
      }

      .ai-options-section .option-help-text {
        margin: 0 0 20px 30px;
        font-size: 0.875rem;
        color: var(--mat-sys-on-surface);
        opacity: 0.6;
        line-height: 1.4;
      }

      .ai-options-section mat-form-field {
        margin-bottom: 20px;
      }

      .groups-section {
        margin-top: 32px;
        padding-top: 24px;
        border-top: 1px solid var(--mat-sys-outline-variant);
      }

      .groups-section h4 {
        margin: 0 0 12px 0;
        font-size: 1.125rem;
        font-weight: 500;
        color: var(--mat-sys-on-surface);
      }

      .groups-section .section-description {
        margin: 0 0 20px 0;
        font-size: 0.875rem;
        color: var(--mat-sys-on-surface);
        opacity: 0.7;
        line-height: 1.4;
      }

      .groups-section mat-form-field {
        margin-bottom: 20px;
      }

      .selected-groups {
        margin-bottom: 8px;
      }

      .selected-groups mat-chip-set {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }

      .group-chip {
        background-color: #2196f3 !important;
        color: white !important;
        display: inline-flex !important;
        align-items: center !important;
        vertical-align: middle !important;
      }

      .group-chip mat-icon {
        color: white !important;
        display: inline-flex !important;
        align-items: center !important;
        vertical-align: middle !important;
      }

      .create-option {
        color: var(--mat-sys-primary) !important;
        font-weight: 500;
      }

      .create-option mat-icon {
        color: var(--mat-sys-primary) !important;
        margin-right: 8px;
      }

      .options-list {
        margin: 8px 0;
        padding-left: 20px;
      }

      .options-list li {
        margin: 4px 0;
        color: var(--mat-sys-on-surface);
      }

      .preview-prompt,
      .preview-loading,
      .preview-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 20px;
        text-align: center;
      }

      .preview-prompt mat-icon,
      .preview-error mat-icon {
        font-size: 64px;
        width: 64px;
        height: 64px;
        margin-bottom: 16px;
        opacity: 0.6;
      }

      .preview-prompt p {
        margin: 8px 0 24px 0;
        font-size: 1rem;
      }

      .preview-loading {
        padding: 40px 20px;
      }

      .preview-loading p {
        margin: 16px 0 0 0;
      }

      .preview-loading p.muted {
        font-size: 0.875rem;
        opacity: 0.7;
      }

      .preview-error h4 {
        margin: 0 0 12px 0;
        color: var(--mat-sys-error);
      }

      .preview-error .error-message {
        margin: 12px 0;
        padding: 16px;
        background: rgba(var(--mat-sys-error-rgb, 244, 67, 54), 0.1);
        border-radius: 8px;
        color: var(--mat-sys-on-surface);
        max-width: 600px;
      }

      .preview-error .error-actions {
        display: flex;
        gap: 16px;
        margin-top: 32px;
        justify-content: flex-end;
        flex-wrap: wrap;
        align-items: center;
      }

      .preview-error .error-actions .back-button,
      .preview-error .error-actions .retry-button,
      .step-actions .back-button,
      .step-actions button {
        ::ng-deep .mdc-button__label {
          display: flex;
          align-items: center;
          gap: 8px;
        }
      }

      .preview-error .error-actions .back-button {
        color: var(--mat-sys-primary) !important;
      }

      .preview-error .error-actions .back-button ::ng-deep .mdc-button__label {
        color: var(--mat-sys-primary) !important;
      }

      .preview-error .error-actions .back-button mat-icon {
        color: var(--mat-sys-primary) !important;
      }

      .preview-error .error-actions .back-button mat-icon,
      .preview-error .error-actions .retry-button mat-icon,
      .step-actions .back-button mat-icon,
      .step-actions button mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        margin: 0;
        vertical-align: middle;
      }

      .step-actions .back-button {
        color: var(--mat-sys-primary) !important;
      }

      .step-actions .back-button ::ng-deep .mdc-button__label {
        color: var(--mat-sys-primary) !important;
      }

      .step-actions .back-button mat-icon {
        color: var(--mat-sys-primary) !important;
      }

      .preview-error .error-actions .retry-button {
        font-weight: 500;
      }

      .preview-success {
        margin-top: 24px;
      }

      .preview-success .success-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 24px;
        padding: 16px;
        background: rgba(var(--mat-sys-primary-rgb, 33, 150, 243), 0.1);
        border-radius: 8px;
      }

      .preview-success .success-header mat-icon {
        font-size: 32px;
        width: 32px;
        height: 32px;
      }

      .preview-success .success-header p {
        margin: 0;
        font-weight: 500;
        font-size: 1.1rem;
      }

      .preview-articles {
        display: flex;
        flex-direction: column;
        gap: 16px;
        margin-bottom: 24px;
      }

      .preview-article-card {
        border-left: 4px solid var(--mat-sys-primary);
      }

      .preview-article-card mat-card-header {
        margin-bottom: 12px;
      }

      .preview-article-card .article-content {
        margin: 0 0 8px 0;
        color: var(--mat-sys-on-surface);
        line-height: 1.6;
      }

      .preview-article-card .article-date {
        font-size: 0.875rem;
        margin: 8px 0 0 0;
      }

      .preview-article-card .media-container {
        margin: 16px 0;
        background-color: #000;
        border-radius: 4px;
        overflow: hidden;
      }

      .preview-article-card .media-container iframe {
        width: 100%;
        aspect-ratio: 16 / 9;
        display: block;
      }

      .subreddit-option {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .subreddit-option strong {
        font-weight: 500;
        color: var(--mat-sys-on-surface);
      }

      .subreddit-title {
        font-size: 0.875rem;
        color: var(--mat-sys-on-surface);
        opacity: 0.7;
      }

      .channel-option {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
      }

      .channel-thumbnail {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        object-fit: cover;
        flex-shrink: 0;
      }

      .channel-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
        min-width: 0;
      }

      .channel-info strong {
        font-weight: 500;
        color: var(--mat-sys-on-surface);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .channel-title {
        font-size: 0.875rem;
        color: var(--mat-sys-on-surface);
        opacity: 0.7;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .channel-subscribers {
        font-size: 0.75rem;
        color: var(--mat-sys-on-surface);
        opacity: 0.6;
      }

      /* Spinner margin for YouTube channel search */
      .channel-search-spinner {
        margin-right: 8px;
      }
    `,
  ],
})
export class FeedFormComponent implements OnInit, OnDestroy {
  @ViewChild("stepper") stepper!: MatStepper;

  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private snackBar = inject(MatSnackBar);
  feedService = inject(FeedService);
  aggregatorService = inject(AggregatorService);
  userSettingsService = inject(UserSettingsService);
  groupService = inject(GroupService);
  searchService = inject(FeedFormSearchService);
  validationService = inject(FeedFormValidationService);
  private breadcrumbService = inject(BreadcrumbService);
  private sanitizer = inject(DomSanitizer);

  private destroy$ = new Subject<void>();

  creating = signal<boolean>(false);
  previewing = signal<boolean>(false);
  previewResponse = signal<FeedPreviewResponse | null>(null);
  selectedAggregator = signal<Aggregator | null>(null);
  aggregatorDetail = signal<AggregatorDetail | null>(null);
  imageErrors: Record<string, boolean> = {};
  private hasAutoPreviewed = false;
  isEditMode = signal<boolean>(false);
  feedId = signal<number | null>(null);
  loadingFeed = signal<boolean>(false);
  hasOpenAICredentials = signal<boolean>(false);

  // Search timeouts
  private subredditSearchTimeout: ReturnType<typeof setTimeout> | null = null;
  private channelSearchTimeout: ReturnType<typeof setTimeout> | null = null;

  // Group selection with autocomplete
  groupInputControl = new FormControl<string | null>("");
  selectedGroupIds = signal<number[]>([]);
  filteredGroups = signal<Group[]>([]);
  creatingGroup = signal<boolean>(false);

  // Expose Object for template usage
  protected readonly Object = Object;

  searchControl = new FormControl("");
  typeControl = new FormControl<"managed" | "social" | "custom" | null>(null);

  aggregatorFormGroup = this.fb.nonNullable.group({
    aggregatorType: ["", Validators.required],
  });

  feedFormGroup: FormGroup = this.validationService.createFeedFormGroup();

  get aiSummarizeControl(): FormControl {
    return this.feedFormGroup.get("ai_summarize") as FormControl;
  }

  get aiTranslateToControl(): FormControl {
    return this.feedFormGroup.get("ai_translate_to") as FormControl;
  }

  get aiCustomPromptControl(): FormControl {
    return this.feedFormGroup.get("ai_custom_prompt") as FormControl;
  }

  ngOnInit() {
    // Check if user has OpenAI credentials
    this.userSettingsService
      .getSettings()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (settings) => {
          this.hasOpenAICredentials.set(settings.openai_enabled);
        },
        error: () => {
          this.hasOpenAICredentials.set(false);
        },
      });

    // Load groups
    this.groupService
      .loadGroups()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (groups) => {
          this.filteredGroups.set(groups);
          // Initialize filter
          this.filterGroups("");
        },
      });

    // Set up group input filtering
    this.groupInputControl.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((value) => {
        this.filterGroups(value || "");
      });

    // Sync selected groups with form when they change
    // Use a computed or watch pattern - for now, we'll update on selection/removal

    // Check if we're in edit mode
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const id = params["id"];
      if (id) {
        this.isEditMode.set(true);
        this.feedId.set(Number(id));
        this.loadFeedForEdit(Number(id));
      } else {
        this.isEditMode.set(false);
        this.feedId.set(null);
        this.loadAggregators();
      }
    });

    // Set up reactive search
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((value) => {
        this.aggregatorService.setSearch(value || "");
      });

    // Set up type filter
    this.typeControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((value) => {
        this.aggregatorService.setTypeFilter(value);
      });

    // Watch for aggregator selection changes
    this.aggregatorFormGroup
      .get("aggregatorType")
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.onAggregatorTypeChange();
      });
  }

  ngOnDestroy() {
    // Clear breadcrumb label when leaving
    if (this.feedId()) {
      this.breadcrumbService.clearLabel(`id:${this.feedId()}`);
    }
    // Clear subreddit search timeout
    if (this.subredditSearchTimeout) {
      clearTimeout(this.subredditSearchTimeout);
    }
    // Clear channel search timeout
    if (this.channelSearchTimeout) {
      clearTimeout(this.channelSearchTimeout);
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadAggregators() {
    this.aggregatorService
      .loadAggregators()
      .pipe(takeUntil(this.destroy$))
      .subscribe();
  }

  loadFeedForEdit(id: number) {
    this.loadingFeed.set(true);
    this.feedService
      .getFeed(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (feed) => {
          this.loadingFeed.set(false);
          // Update breadcrumb with feed name
          this.breadcrumbService.setLabel(`id:${feed.id}`, feed.name);
          // Load aggregators first, then populate form
          this.aggregatorService
            .loadAggregators()
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => {
              // Set aggregator type
              this.aggregatorFormGroup.patchValue({
                aggregatorType: feed.aggregator,
              });

              // Load aggregator detail and populate form
              this.aggregatorService
                .getAggregatorDetail(feed.aggregator)
                .pipe(takeUntil(this.destroy$))
                .subscribe((detail) => {
                  this.aggregatorDetail.set(detail);
                  const agg = this.aggregatorService.getAggregator(
                    feed.aggregator,
                  );
                  this.selectedAggregator.set(agg);

                  // Load feed groups
                  this.groupService
                    .getFeedGroups(feed.id)
                    .pipe(takeUntil(this.destroy$))
                    .subscribe({
                      next: (groups) => {
                        const groupIds = groups.map((g) => g.id);
                        this.selectedGroupIds.set(groupIds);
                      },
                    });

                  // Populate feed form with existing values
                  this.feedFormGroup.patchValue({
                    name: feed.name,
                    identifier: feed.identifier,
                    enabled: feed.enabled,
                    generate_title_image: feed.generateTitleImage,
                    add_source_footer: feed.addSourceFooter,
                    skip_duplicates: feed.skipDuplicates,
                    use_current_timestamp: feed.useCurrentTimestamp,
                    daily_post_limit: feed.dailyPostLimit,
                    // Only populate AI features for non-managed aggregators
                    ai_translate_to: this.isManagedAggregator()
                      ? ""
                      : feed.aiTranslateTo || "",
                    ai_summarize: this.isManagedAggregator()
                      ? false
                      : feed.aiSummarize || false,
                    ai_custom_prompt: this.isManagedAggregator()
                      ? ""
                      : feed.aiCustomPrompt || "",
                  });

                  // Disable identifier field if not editable
                  const identifierControl =
                    this.feedFormGroup.get("identifier");
                  if (identifierControl) {
                    if (
                      !detail.identifierEditable &&
                      !detail.identifierChoices
                    ) {
                      identifierControl.disable();
                    } else {
                      identifierControl.enable();
                    }
                  }

                  // Add option fields dynamically and populate with existing values (filtered for managed aggregators)
                  const filteredOptions = this.getFilteredOptions();
                  if (filteredOptions) {
                    this.validationService.addAggregatorOptions(
                      this.feedFormGroup,
                      filteredOptions,
                      feed.aggregatorOptions,
                    );
                  }

                  // Skip to step 2 (index 0 when Step 1 is hidden) after a short delay to ensure stepper is initialized
                  setTimeout(() => {
                    if (this.stepper) {
                      // When Step 1 is hidden, Step 2 becomes index 0
                      this.stepper.selectedIndex = 0;
                    }
                  }, 100);
                });
            });
        },
        error: (error) => {
          this.loadingFeed.set(false);
          this.snackBar.open(`Failed to load feed: ${error.message}`, "Close", {
            duration: 5000,
          });
          this.router.navigate(["/feeds"]);
        },
      });
  }

  selectAggregator(aggregatorId: string) {
    this.aggregatorFormGroup.patchValue({ aggregatorType: aggregatorId });
  }

  onAggregatorTypeChange() {
    const modulePath = this.aggregatorFormGroup.get("aggregatorType")?.value;
    if (modulePath) {
      const agg = this.aggregatorService.getAggregator(modulePath);
      this.selectedAggregator.set(agg);

      // Reset form fields when aggregator changes
      const currentDailyLimit =
        this.feedFormGroup.get("daily_post_limit")?.value;
      const patchValue: Partial<{
        name: string;
        identifier: string;
        daily_post_limit: number;
      }> = {
        name: "",
        identifier: "",
      };

      // Set aggregator-specific default for daily_post_limit
      const defaultLimit = agg?.defaultDailyLimit ?? 50;
      // If it's the old default (50) or undefined, set to aggregator's default
      if (
        currentDailyLimit === 50 ||
        currentDailyLimit === undefined ||
        currentDailyLimit === null
      ) {
        patchValue.daily_post_limit = defaultLimit;
      } else if (currentDailyLimit === 20 && defaultLimit !== 20) {
        // If switching from Reddit (20) to another aggregator, use new default
        patchValue.daily_post_limit = defaultLimit;
      }

      this.feedFormGroup.patchValue(patchValue);

      // Fetch aggregator detail for identifier configuration and options
      this.aggregatorService
        .getAggregatorDetail(modulePath)
        .pipe(takeUntil(this.destroy$))
        .subscribe((detail) => {
          this.aggregatorDetail.set(detail);

          // Set default name from aggregator (if prefillName is enabled)
          // Skip prefilling if prefillName is explicitly false
          // Default to true if undefined (backward compatibility)
          const shouldPrefillName =
            detail.prefillName === undefined || detail.prefillName === true;
          if (agg && agg.name && shouldPrefillName) {
            this.feedFormGroup.patchValue({ name: agg.name });
          }

          // Set default identifier value for managed aggregators
          if (agg && agg.type === "managed" && agg.url) {
            this.feedFormGroup.patchValue({ identifier: agg.url });
          }

          // Disable identifier field if not editable
          const identifierControl = this.feedFormGroup.get("identifier");
          if (identifierControl) {
            if (!detail.identifierEditable && !detail.identifierChoices) {
              identifierControl.disable();
            } else {
              identifierControl.enable();
            }
          }

          // Add option fields dynamically (filtered for managed aggregators)
          const filteredOptions = this.getFilteredOptions();
          if (filteredOptions) {
            this.validationService.addAggregatorOptions(
              this.feedFormGroup,
              filteredOptions,
            );
          }
        });
    } else {
      // Reset when no aggregator is selected
      this.selectedAggregator.set(null);
      this.aggregatorDetail.set(null);
      this.feedFormGroup.patchValue({
        name: "",
        identifier: "",
      });
      // Clear option fields
      Object.keys(this.feedFormGroup.controls).forEach((key) => {
        if (key.startsWith("option_")) {
          this.feedFormGroup.removeControl(key);
        }
      });
      // Re-enable identifier field
      const identifierControl = this.feedFormGroup.get("identifier");
      if (identifierControl) {
        identifierControl.enable();
      }
    }
  }

  onPageChange(event: PageEvent) {
    const currentPageSize = this.aggregatorService.pageSize();
    const pageSizeChanged = event.pageSize !== currentPageSize;

    if (pageSizeChanged) {
      // setPageSize resets to page 1, so we don't need to set the page separately
      this.aggregatorService.setPageSize(event.pageSize);
    } else {
      // Only page changed, update it
      this.aggregatorService.setPage(event.pageIndex + 1);
    }
  }

  onStepChange(event: {
    selectedIndex: number;
    previouslySelectedIndex: number;
  }) {
    // Determine the preview step index based on edit mode
    // In create mode: Step 1 (index 0) -> Step 2 (index 1) -> Step 3 (index 2)
    // In edit mode: Step 2 (index 0) -> Step 3 (index 1)
    const previewStepIndex = this.isEditMode() ? 1 : 2;

    // When reaching preview step, automatically load and display the feed
    if (event.selectedIndex === previewStepIndex) {
      // Check if forms are valid before auto-previewing
      if (this.aggregatorFormGroup.valid && this.feedFormGroup.valid) {
        // Only auto-preview if we haven't already loaded a preview
        if (!this.hasAutoPreviewed) {
          this.hasAutoPreviewed = true;
          this.previewFeed();
        }
      }
    }

    // Reset auto-preview flag and clear preview when going back from preview step
    // This allows re-previewing if user changes configuration
    if (event.selectedIndex < previewStepIndex) {
      this.hasAutoPreviewed = false;
      this.previewResponse.set(null);
    }
  }

  getAggregatorIcon(feedType: string): string {
    const icons: Record<string, string> = {
      article: "article",
      youtube: "play_circle",
      podcast: "podcast",
      reddit: "forum",
    };
    return icons[feedType] || "rss_feed";
  }

  isIdentifierEditable(): boolean {
    const detail = this.aggregatorDetail();
    // Use identifierEditable if explicitly set, otherwise fall back to checking for choices
    if (detail?.identifierEditable !== undefined) {
      return detail.identifierEditable;
    }
    // Legacy: if identifierChoices exist, allow editing
    return !!(detail?.identifierChoices && detail.identifierChoices.length > 0);
  }

  protected getIdentifierControl(): FormControl<string> {
    return this.feedFormGroup.get("identifier") as FormControl<string>;
  }

  /**
   * Check if current aggregator is managed type.
   */
  isManagedAggregator(): boolean {
    const agg = this.selectedAggregator();
    return agg?.type === "managed";
  }

  /**
   * Filter out restricted options for managed aggregators.
   */
  getFilteredOptions(): Record<string, AggregatorDetail["options"][string]> {
    return this.validationService.getFilteredOptions(
      this.aggregatorDetail(),
      this.isManagedAggregator(),
    );
  }

  previewFeed() {
    if (!this.aggregatorFormGroup.valid || !this.feedFormGroup.valid) {
      return;
    }

    this.previewing.set(true);
    this.previewResponse.set(null);

    // Collect aggregator options (filtered for managed aggregators)
    const filteredOptions = this.getFilteredOptions();
    const aggregatorOptions = this.validationService.collectAggregatorOptions(
      this.feedFormGroup,
      filteredOptions,
    );

    // Determine feed type from aggregator
    const agg = this.selectedAggregator();
    const feedType = agg?.feedType || "article";

    const previewData = {
      name: this.feedFormGroup.get("name")?.value ?? "",
      identifier: this.feedFormGroup.get("identifier")?.value ?? "",
      aggregator: this.aggregatorFormGroup.get("aggregatorType")?.value ?? "",
      feedType: feedType,
      enabled: this.feedFormGroup.get("enabled")?.value || true,
      generateTitleImage:
        this.feedFormGroup.get("generate_title_image")?.value ?? true,
      addSourceFooter:
        this.feedFormGroup.get("add_source_footer")?.value ?? true,
      skipDuplicates: this.feedFormGroup.get("skip_duplicates")?.value ?? true,
      useCurrentTimestamp:
        this.feedFormGroup.get("use_current_timestamp")?.value ?? true,
      dailyPostLimit:
        this.feedFormGroup.get("daily_post_limit")?.value ||
        (() => {
          const agg = this.selectedAggregator();
          return agg?.defaultDailyLimit ?? 50;
        })(),
      aggregatorOptions: aggregatorOptions,
      // Only include AI features for non-managed aggregators
      aiTranslateTo: this.isManagedAggregator()
        ? ""
        : this.feedFormGroup.get("ai_translate_to")?.value || "",
      aiSummarize: this.isManagedAggregator()
        ? false
        : this.feedFormGroup.get("ai_summarize")?.value || false,
      aiCustomPrompt: this.isManagedAggregator()
        ? ""
        : this.feedFormGroup.get("ai_custom_prompt")?.value || "",
    };

    this.feedService
      .previewFeed(previewData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.previewing.set(false);
          this.previewResponse.set(response);
        },
        error: (error) => {
          if (this.destroy$.closed) return;
          this.previewing.set(false);
          this.previewResponse.set({
            success: false,
            articles: [],
            count: 0,
            error: error.message || "Unknown error occurred",
            errorType: "unknown",
          });
        },
      });
  }

  /**
   * Handle subreddit search input.
   */
  onSubredditSearch(event: Event): void {
    const input = event.target as HTMLInputElement;
    const query = input.value.trim();

    if (query.length < 2) {
      this.searchService.subredditSearchResults.set([]);
      this.searchService.searchingSubreddits.set(false);
      return;
    }

    // Clear existing timeout
    if (this.subredditSearchTimeout) {
      clearTimeout(this.subredditSearchTimeout);
    }

    // Debounce the search
    this.subredditSearchTimeout = setTimeout(() => {
      const currentValue = this.feedFormGroup.get("identifier")?.value?.trim();
      if (currentValue === query && query.length >= 2) {
        this.searchService.searchSubreddits(query);
      }
    }, 500);
  }

  /**
   * Handle subreddit selection from autocomplete.
   */
  onSubredditSelected(
    subreddit:
      | string
      | { name: string; displayName: string; title: string }
      | { option: { value: string | { name: string } } }
      | null,
  ): void {
    // Handle both event object and direct subreddit value
    const value =
      typeof subreddit === "object" && subreddit && "option" in subreddit
        ? subreddit.option.value
        : subreddit;
    if (value) {
      const subredditName =
        typeof value === "string"
          ? value
          : (value as { name: string }).name || value;
      this.feedFormGroup.patchValue({ identifier: subredditName });
    }
  }

  /**
   * Handle channel search input.
   */
  onChannelSearch(event: Event): void {
    const input = event.target as HTMLInputElement;
    const query = input.value?.trim() || "";

    // Clear existing timeout
    if (this.channelSearchTimeout) {
      clearTimeout(this.channelSearchTimeout);
    }

    // Debounce the search
    this.channelSearchTimeout = setTimeout(() => {
      const currentValue = this.feedFormGroup.get("identifier")?.value?.trim();
      if (currentValue === query && query.length >= 2) {
        this.searchService.searchChannels(query);
      }
    }, 500);
  }

  /**
   * Handle channel selection from autocomplete.
   */
  onChannelSelected(
    channel:
      | string
      | {
          channelId: string;
          title: string;
          handle: string | null;
        }
      | { option: { value: { channelId: string; handle: string | null } } }
      | null,
  ): void {
    // Handle both event object and direct channel value
    const value =
      typeof channel === "object" && channel && "option" in channel
        ? channel.option.value
        : channel;
    if (value && typeof value === "object" && "channelId" in value) {
      // Prefer handle if available, otherwise use channelId
      // The YouTube aggregator can resolve both
      const identifier = value.handle ? `@${value.handle}` : value.channelId;
      this.feedFormGroup.patchValue({ identifier });
    }
  }

  /**
   * Filter groups based on input value.
   */
  filterGroups(searchValue: string): void {
    const allGroups = this.groupService.groups();
    if (!searchValue) {
      this.filteredGroups.set(allGroups);
      return;
    }

    const searchLower = searchValue.toLowerCase();
    const filtered = allGroups.filter(
      (group) =>
        group.name.toLowerCase().includes(searchLower) &&
        !this.selectedGroupIds().includes(group.id),
    );
    this.filteredGroups.set(filtered);
  }

  /**
   * Get groups that can be created (not already existing).
   */
  getCreateGroupOption(): string | null {
    const inputValue = this.groupInputControl.value?.trim() || "";
    if (!inputValue || inputValue.length < 1) {
      return null;
    }

    // Check if group with this name already exists
    const allGroups = this.groupService.groups();
    const exists = allGroups.some(
      (g) => g.name.toLowerCase() === inputValue.toLowerCase(),
    );

    // Check if already selected
    const selectedGroups = this.groupService
      .groups()
      .filter((g) => this.selectedGroupIds().includes(g.id));
    const alreadySelected = selectedGroups.some(
      (g) => g.name.toLowerCase() === inputValue.toLowerCase(),
    );

    if (exists || alreadySelected) {
      return null;
    }

    return inputValue;
  }

  /**
   * Select an existing group.
   */
  selectGroup(group: Group): void {
    if (!group || !group.id || group.id <= 0) {
      return;
    }
    const currentIds = this.selectedGroupIds();
    if (!currentIds.includes(group.id)) {
      const newIds = [...currentIds, group.id];
      this.selectedGroupIds.set(newIds);
      this.feedFormGroup.patchValue({ groupIds: newIds }, { emitEvent: false });
    }
    this.groupInputControl.setValue("");
    this.filterGroups("");
  }

  /**
   * Remove a selected group.
   */
  removeGroup(groupId: number): void {
    const currentIds = this.selectedGroupIds();
    const newIds = currentIds.filter((id) => id !== groupId);
    this.selectedGroupIds.set(newIds);
    this.feedFormGroup.patchValue({ groupIds: newIds }, { emitEvent: false });
  }

  /**
   * Create a new group from the input value.
   */
  createGroupFromInput(): void {
    const name = this.getCreateGroupOption();
    if (!name) {
      return;
    }

    this.creatingGroup.set(true);
    this.groupService
      .createGroup(name)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (group) => {
          // Wait for groups to reload, then add to selection
          this.groupService
            .loadGroups()
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: () => {
                this.creatingGroup.set(false);
                this.groupInputControl.setValue("");
                this.filterGroups("");
                // Add to selection after groups are reloaded
                this.selectGroup(group);
                this.snackBar.open(
                  `Created and added group: ${group.name}`,
                  "Close",
                  {
                    duration: 3000,
                  },
                );
              },
              error: () => {
                // Even if reload fails, still add the group to selection
                this.creatingGroup.set(false);
                this.groupInputControl.setValue("");
                this.filterGroups("");
                this.selectGroup(group);
                this.snackBar.open(
                  `Created and added group: ${group.name}`,
                  "Close",
                  {
                    duration: 3000,
                  },
                );
              },
            });
        },
        error: (error) => {
          this.creatingGroup.set(false);
          this.snackBar.open(
            `Failed to create group: ${error.message || "Unknown error"}`,
            "Close",
            {
              duration: 5000,
            },
          );
        },
      });
  }

  /**
   * Display function for group autocomplete.
   */
  displayGroup(group: Group | null): string {
    return group ? group.name : "";
  }

  /**
   * Handle group option selection from autocomplete.
   */
  onGroupSelected(event: { option: { value: Group } }): void {
    const group = event.option.value;
    if (group && typeof group === "object" && group.id) {
      this.selectGroup(group);
    }
  }

  /**
   * Get a group by ID.
   */
  getGroupById(groupId: number): Group | undefined {
    return this.groupService.groups().find((g) => g.id === groupId);
  }

  /**
   * Handle Enter key press in group input.
   */
  handleGroupInputEnter(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    keyboardEvent.preventDefault();
    const createOption = this.getCreateGroupOption();
    if (createOption) {
      this.createGroupFromInput();
    }
  }

  /**
   * Check if preview article is a YouTube video.
   */
  isYouTubeVideo(article: PreviewArticle): boolean {
    return article.feedType === "youtube" && !!article.mediaUrl;
  }

  /**
   * Get safe YouTube embed URL for preview article.
   */
  getYouTubeEmbedUrl(article: PreviewArticle): SafeResourceUrl {
    if (!article.mediaUrl) {
      return this.sanitizer.bypassSecurityTrustResourceUrl("");
    }

    // If mediaUrl already includes the proxy path, use it directly
    if (article.mediaUrl.includes("/api/youtube-proxy")) {
      // Safe: URL is from our internal YouTube proxy API endpoint
      // eslint-disable-next-line sonarjs/no-angular-bypass-sanitization
      return this.sanitizer.bypassSecurityTrustResourceUrl(article.mediaUrl);
    }

    // Extract video ID from standard YouTube URLs
    const videoIdMatch = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/]+)/.exec(
      article.link,
    );
    if (videoIdMatch && videoIdMatch[1]) {
      const videoId = videoIdMatch[1];
      // Safe: URL is constructed from trusted YouTube domain with extracted video ID
      // eslint-disable-next-line sonarjs/no-angular-bypass-sanitization
      return this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://www.youtube.com/embed/${videoId}`,
      );
    }

    return this.sanitizer.bypassSecurityTrustResourceUrl("");
  }

  createFeed() {
    if (!this.aggregatorFormGroup.valid || !this.feedFormGroup.valid) {
      return;
    }

    this.creating.set(true);

    // Collect aggregator options (filtered for managed aggregators)
    const filteredOptions = this.getFilteredOptions();
    const aggregatorOptions = this.validationService.collectAggregatorOptions(
      this.feedFormGroup,
      filteredOptions,
    );

    // Determine feed type from aggregator
    const agg = this.selectedAggregator();
    const feedType = agg?.feedType || "article";

    // Filter out invalid group IDs (must be positive integers > 0)
    const groupIds = (this.selectedGroupIds() || []).filter(
      (id) => typeof id === "number" && Number.isInteger(id) && id > 0,
    );

    const feedData = {
      name: this.feedFormGroup.get("name")?.value ?? "",
      identifier: this.feedFormGroup.get("identifier")?.value ?? "",
      aggregator: this.aggregatorFormGroup.get("aggregatorType")?.value ?? "",
      feedType: feedType,
      enabled: this.feedFormGroup.get("enabled")?.value || true,
      generateTitleImage:
        this.feedFormGroup.get("generate_title_image")?.value ?? true,
      addSourceFooter:
        this.feedFormGroup.get("add_source_footer")?.value ?? true,
      skipDuplicates: this.feedFormGroup.get("skip_duplicates")?.value ?? true,
      useCurrentTimestamp:
        this.feedFormGroup.get("use_current_timestamp")?.value ?? true,
      dailyPostLimit:
        this.feedFormGroup.get("daily_post_limit")?.value ||
        (() => {
          const agg = this.selectedAggregator();
          return agg?.defaultDailyLimit ?? 50;
        })(),
      aggregatorOptions: aggregatorOptions,
      groupIds: groupIds,
      // Only include AI features for non-managed aggregators
      aiTranslateTo: this.isManagedAggregator()
        ? ""
        : this.feedFormGroup.get("ai_translate_to")?.value || "",
      aiSummarize: this.isManagedAggregator()
        ? false
        : this.feedFormGroup.get("ai_summarize")?.value || false,
      aiCustomPrompt: this.isManagedAggregator()
        ? ""
        : this.feedFormGroup.get("ai_custom_prompt")?.value || "",
    };

    const feedId = this.feedId();
    if (this.isEditMode() && feedId) {
      // Update existing feed
      this.feedService
        .updateFeed(feedId, feedData)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (feed) => {
            this.creating.set(false);
            this.snackBar.open(`Updated feed: ${feed.name}`, "Close", {
              duration: 3000,
              panelClass: ["success-snackbar"],
            });
            this.router.navigate(["/feeds", feed.id]);
          },
          error: (error) => {
            if (this.destroy$.closed) return;
            this.creating.set(false);
            this.snackBar.open(
              `Failed to update feed: ${error.message || "Unknown error"}`,
              "Close",
              {
                duration: 5000,
              },
            );
          },
        });
    } else {
      // Create new feed
      this.feedService.createFeed(feedData).subscribe({
        next: (feed) => {
          this.creating.set(false);
          this.snackBar.open(`Created feed: ${feed.name}`, "Close", {
            duration: 3000,
            panelClass: ["success-snackbar"],
          });
          this.router.navigate(["/feeds", feed.id], {
            queryParams: { fetch: "true" },
          });
        },
        error: (error) => {
          this.creating.set(false);
          this.snackBar.open(
            `Failed to create feed: ${error.message || "Unknown error"}`,
            "Close",
            {
              duration: 5000,
            },
          );
        },
      });
    }
  }
}
