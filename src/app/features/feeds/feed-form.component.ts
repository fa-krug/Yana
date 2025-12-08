/**
 * Feed form component - multi-step form for creating and editing feeds.
 */

import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  ViewChild,
  ChangeDetectionStrategy,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router, RouterModule, ActivatedRoute } from "@angular/router";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  AbstractControl,
} from "@angular/forms";
import {
  Subject,
  debounceTime,
  distinctUntilChanged,
  takeUntil,
  from,
} from "rxjs";
import { PageEvent } from "@angular/material/paginator";
import { MatStepper } from "@angular/material/stepper";

// Material imports
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatStepperModule } from "@angular/material/stepper";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatDividerModule } from "@angular/material/divider";
import { MatPaginatorModule } from "@angular/material/paginator";
import { MatChipsModule } from "@angular/material/chips";
import { MatAutocompleteModule } from "@angular/material/autocomplete";
import { MatTooltipModule } from "@angular/material/tooltip";

import { FeedService } from "../../core/services/feed.service";
import { AggregatorService } from "../../core/services/aggregator.service";
import { UserSettingsService } from "../../core/services/user-settings.service";
import { BreadcrumbService } from "../../core/services/breadcrumb.service";
import { TRPCService } from "../../core/trpc/trpc.service";
import {
  Aggregator,
  AggregatorDetail,
  Feed,
  FeedPreviewResponse,
  PreviewArticle,
  Group,
} from "../../core/models";
import { GroupService } from "../../core/services/group.service";

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
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatStepperModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDividerModule,
    MatPaginatorModule,
    MatChipsModule,
    MatAutocompleteModule,
    MatTooltipModule,
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
              <!-- Step 1: Select Aggregator Type (hidden in edit mode) -->
              @if (!isEditMode()) {
                <mat-step [stepControl]="aggregatorFormGroup">
                  <form [formGroup]="aggregatorFormGroup">
                    <ng-template matStepLabel>Select</ng-template>

                    <h3>Choose Feed Type</h3>
                    <p>
                      Select how you want to aggregate content for this feed.
                    </p>

                    <div class="aggregator-filters">
                      <mat-form-field appearance="outline" class="search-field">
                        <mat-label>Search aggregators</mat-label>
                        <input matInput [formControl]="searchControl" />
                        <mat-icon matPrefix>search</mat-icon>
                      </mat-form-field>

                      <mat-form-field appearance="outline" class="filter-field">
                        <mat-label>Type</mat-label>
                        <mat-select [formControl]="typeControl">
                          <mat-option [value]="null">All Types</mat-option>
                          <mat-option value="managed">Managed</mat-option>
                          <mat-option value="social">Social</mat-option>
                          <mat-option value="custom">Custom</mat-option>
                        </mat-select>
                      </mat-form-field>
                    </div>

                    @if (aggregatorService.loading()) {
                      <div class="loading">
                        <mat-spinner diameter="40"></mat-spinner>
                        <p>Loading aggregators...</p>
                      </div>
                    } @else if (
                      aggregatorService.paginatedAggregators().length === 0
                    ) {
                      <div class="empty-state">
                        <mat-icon>search_off</mat-icon>
                        <p>No aggregators found</p>
                        <p class="muted">
                          Try adjusting your search or filters
                        </p>
                      </div>
                    } @else {
                      <div class="aggregator-grid">
                        @for (
                          agg of aggregatorService.paginatedAggregators();
                          track agg.id
                        ) {
                          <mat-card
                            class="aggregator-card"
                            [class.selected]="
                              aggregatorFormGroup.get('aggregatorType')
                                ?.value === agg.id
                            "
                            (click)="selectAggregator(agg.id)"
                          >
                            <mat-card-header>
                              <div class="aggregator-icon">
                                @if (agg.icon && !imageErrors[agg.id]) {
                                  <img
                                    [src]="agg.icon"
                                    [alt]="agg.name"
                                    class="aggregator-image"
                                    (error)="imageErrors[agg.id] = true"
                                  />
                                }
                                @if (!agg.icon || imageErrors[agg.id]) {
                                  <mat-icon
                                    [class]="
                                      'feed-icon ' + (agg.feedType || 'article')
                                    "
                                  >
                                    {{
                                      getAggregatorIcon(
                                        agg.feedType || "article"
                                      )
                                    }}
                                  </mat-icon>
                                }
                              </div>
                              <mat-card-title>{{ agg.name }}</mat-card-title>
                              <mat-card-subtitle>{{
                                agg.id
                              }}</mat-card-subtitle>
                            </mat-card-header>
                            <mat-card-content>
                              @if (agg.description) {
                                <p class="aggregator-description">
                                  {{ agg.description }}
                                </p>
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
                              aggregatorFormGroup.get("aggregatorType")
                                ?.value === agg.id
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
                        [length]="aggregatorService.totalCount()"
                        [pageSize]="aggregatorService.pageSize()"
                        [pageIndex]="aggregatorService.currentPage() - 1"
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
                        [disabled]="!aggregatorFormGroup.valid"
                      >
                        Next
                      </button>
                    </div>
                  </form>
                </mat-step>
              }

              <!-- Step 2: Feed Details -->
              <mat-step [stepControl]="feedFormGroup">
                <form [formGroup]="feedFormGroup">
                  <ng-template matStepLabel>Config</ng-template>

                  <h3>Feed Configuration</h3>

                  @if (aggregatorDetail()) {
                    <!-- Feed Name -->
                    <mat-form-field appearance="outline" class="full-width">
                      <mat-label>Feed Name</mat-label>
                      <input matInput formControlName="name" />
                      <mat-hint>A descriptive name for this feed</mat-hint>
                    </mat-form-field>

                    <!-- Identifier Field -->
                    @if (aggregatorDetail()!.identifierChoices) {
                      <mat-form-field appearance="outline" class="full-width">
                        <mat-label>{{
                          aggregatorDetail()!.identifierLabel
                        }}</mat-label>
                        <mat-select formControlName="identifier">
                          @for (
                            choice of aggregatorDetail()!.identifierChoices;
                            track choice[0]
                          ) {
                            <mat-option [value]="choice[0]">{{
                              choice[1]
                            }}</mat-option>
                          }
                        </mat-select>
                        @if (aggregatorDetail()!.identifierDescription) {
                          <mat-hint>{{
                            aggregatorDetail()!.identifierDescription
                          }}</mat-hint>
                        }
                      </mat-form-field>
                    } @else {
                      <!-- Reddit aggregator with autocomplete -->
                      @if (selectedAggregator()?.id === "reddit") {
                        <mat-form-field appearance="outline" class="full-width">
                          <mat-label>{{
                            aggregatorDetail()!.identifierLabel
                          }}</mat-label>
                          <input
                            matInput
                            formControlName="identifier"
                            [matAutocomplete]="subredditAuto"
                            [readonly]="!isIdentifierEditable()"
                            (input)="onSubredditSearch($event)"
                          />
                          @if (searchingSubreddits()) {
                            <mat-spinner matSuffix diameter="20"></mat-spinner>
                          }
                          <mat-autocomplete
                            #subredditAuto="matAutocomplete"
                            [displayWith]="displaySubreddit"
                            (optionSelected)="onSubredditSelected($event)"
                          >
                            @for (
                              subreddit of subredditSearchResults();
                              track subreddit.name
                            ) {
                              <mat-option [value]="subreddit.name">
                                <span class="subreddit-option">
                                  <strong>r/{{ subreddit.displayName }}</strong>
                                  @if (subreddit.title) {
                                    <span class="subreddit-title">{{
                                      subreddit.title
                                    }}</span>
                                  }
                                </span>
                              </mat-option>
                            }
                            @if (
                              subredditSearchResults().length === 0 &&
                              !searchingSubreddits() &&
                              feedFormGroup.get("identifier")?.value &&
                              feedFormGroup.get("identifier")?.value.length > 2
                            ) {
                              <mat-option disabled>
                                No subreddits found
                              </mat-option>
                            }
                          </mat-autocomplete>
                          @if (aggregatorDetail()!.identifierDescription) {
                            <mat-hint>{{
                              aggregatorDetail()!.identifierDescription
                            }}</mat-hint>
                          }
                        </mat-form-field>
                      } @else if (selectedAggregator()?.id === "youtube") {
                        <!-- YouTube aggregator with autocomplete -->
                        <mat-form-field appearance="outline" class="full-width">
                          <mat-label>{{
                            aggregatorDetail()!.identifierLabel
                          }}</mat-label>
                          <input
                            matInput
                            formControlName="identifier"
                            [matAutocomplete]="channelAuto"
                            [readonly]="!isIdentifierEditable()"
                            (input)="onChannelSearch($event)"
                          />
                          @if (searchingChannels()) {
                            <mat-spinner
                              matSuffix
                              diameter="20"
                              class="channel-search-spinner"
                            ></mat-spinner>
                          }
                          <mat-autocomplete
                            #channelAuto="matAutocomplete"
                            [displayWith]="displayChannel"
                            (optionSelected)="onChannelSelected($event)"
                          >
                            @for (
                              channel of channelSearchResults();
                              track channel.channelId
                            ) {
                              <mat-option [value]="channel">
                                <span class="channel-option">
                                  @if (channel.thumbnailUrl) {
                                    <img
                                      [src]="channel.thumbnailUrl"
                                      [alt]="channel.title"
                                      class="channel-thumbnail"
                                    />
                                  }
                                  <div class="channel-info">
                                    <strong>{{
                                      channel.handle
                                        ? "@" + channel.handle
                                        : channel.title
                                    }}</strong>
                                    @if (
                                      channel.handle &&
                                      channel.title !== channel.handle
                                    ) {
                                      <span class="channel-title">{{
                                        channel.title
                                      }}</span>
                                    }
                                    @if (channel.subscriberCount > 0) {
                                      <span class="channel-subscribers">{{
                                        formatSubscriberCount(
                                          channel.subscriberCount
                                        )
                                      }}</span>
                                    }
                                  </div>
                                </span>
                              </mat-option>
                            }
                            @if (
                              channelSearchResults().length === 0 &&
                              !searchingChannels() &&
                              feedFormGroup.get("identifier")?.value &&
                              feedFormGroup.get("identifier")?.value.length > 2
                            ) {
                              <mat-option disabled>
                                No channels found
                              </mat-option>
                            }
                          </mat-autocomplete>
                          @if (aggregatorDetail()!.identifierDescription) {
                            <mat-hint>{{
                              aggregatorDetail()!.identifierDescription
                            }}</mat-hint>
                          }
                        </mat-form-field>
                      } @else {
                        <!-- Other aggregators with regular input -->
                        <mat-form-field appearance="outline" class="full-width">
                          <mat-label>{{
                            aggregatorDetail()!.identifierLabel
                          }}</mat-label>
                          @if (aggregatorDetail()!.identifierType === "url") {
                            <input
                              matInput
                              type="url"
                              formControlName="identifier"
                              [readonly]="!isIdentifierEditable()"
                            />
                          } @else {
                            <input
                              matInput
                              formControlName="identifier"
                              [readonly]="!isIdentifierEditable()"
                            />
                          }
                          @if (aggregatorDetail()!.identifierDescription) {
                            <mat-hint>{{
                              aggregatorDetail()!.identifierDescription
                            }}</mat-hint>
                          }
                        </mat-form-field>
                      }
                    }

                    <!-- Groups Selection -->
                    <div class="groups-section">
                      <h4>Groups</h4>
                      <p class="section-description">
                        Organize this feed into groups for easier filtering and
                        management. Type to search existing groups or create a
                        new one.
                      </p>

                      <!-- Selected groups as chips -->
                      @if (selectedGroupIds().length > 0) {
                        <div class="selected-groups">
                          <mat-chip-set>
                            @for (
                              groupId of selectedGroupIds();
                              track groupId
                            ) {
                              @let group = getGroupById(groupId);
                              @if (group) {
                                <mat-chip
                                  (removed)="removeGroup(groupId)"
                                  class="group-chip"
                                >
                                  {{ group.name }}
                                  <button
                                    matChipRemove
                                    [attr.aria-label]="'remove ' + group.name"
                                  >
                                    <mat-icon>cancel</mat-icon>
                                  </button>
                                </mat-chip>
                              }
                            }
                          </mat-chip-set>
                        </div>
                      }

                      <!-- Group input with autocomplete -->
                      <mat-form-field appearance="outline" class="full-width">
                        <mat-label>Add Group</mat-label>
                        <input
                          matInput
                          [formControl]="groupInputControl"
                          [matAutocomplete]="groupAuto"
                          (keydown.enter)="handleGroupInputEnter($event)"
                        />
                        <mat-icon matPrefix>search</mat-icon>
                        @if (creatingGroup()) {
                          <mat-spinner matSuffix diameter="20"></mat-spinner>
                        }
                        <mat-autocomplete
                          #groupAuto="matAutocomplete"
                          [displayWith]="displayGroup"
                          (optionSelected)="onGroupSelected($event)"
                        >
                          @for (group of filteredGroups(); track group.id) {
                            <mat-option [value]="group">
                              <mat-icon>folder</mat-icon>
                              <span>{{ group.name }}</span>
                            </mat-option>
                          }
                          @if (
                            getCreateGroupOption() &&
                            filteredGroups().length > 0
                          ) {
                            <mat-divider></mat-divider>
                          }
                          @if (getCreateGroupOption()) {
                            <mat-option
                              [value]="null"
                              (onSelectionChange)="
                                $event.isUserInput && createGroupFromInput()
                              "
                              class="create-option"
                            >
                              <mat-icon>add_circle</mat-icon>
                              <span
                                >Create new group: "{{
                                  getCreateGroupOption()
                                }}"</span
                              >
                            </mat-option>
                          }
                          @if (
                            filteredGroups().length === 0 &&
                            !getCreateGroupOption() &&
                            groupInputControl.value &&
                            groupInputControl.value.length > 0
                          ) {
                            <mat-option disabled>
                              No groups found. Type a name and press Enter to
                              create.
                            </mat-option>
                          }
                        </mat-autocomplete>
                        <mat-hint
                          >Type to search existing groups or create a new one.
                          Press Enter to create.</mat-hint
                        >
                      </mat-form-field>
                    </div>

                    <!-- General Feed Options -->
                    <div class="general-options-section">
                      <h4>General Options</h4>

                      <mat-checkbox formControlName="enabled">
                        Enabled
                      </mat-checkbox>
                      <p class="option-help-text">
                        Enable this feed for automatic aggregation
                      </p>

                      <mat-checkbox formControlName="generate_title_image">
                        Extract header image
                      </mat-checkbox>
                      <p class="option-help-text">
                        Extract and display header image from articles
                      </p>

                      <mat-checkbox formControlName="add_source_footer">
                        Add source footer
                      </mat-checkbox>
                      <p class="option-help-text">
                        Add source link at the bottom of articles
                      </p>

                      <mat-checkbox formControlName="skip_duplicates">
                        Skip duplicates
                      </mat-checkbox>
                      <p class="option-help-text">
                        Skip articles with duplicate titles in last 7 days
                      </p>

                      <mat-checkbox formControlName="use_current_timestamp">
                        Use current timestamp
                      </mat-checkbox>
                      <p class="option-help-text">
                        Use current time instead of RSS feed date
                      </p>

                      <mat-form-field appearance="outline" class="full-width">
                        <mat-label>Daily post limit</mat-label>
                        <input
                          matInput
                          type="number"
                          formControlName="daily_post_limit"
                          [min]="-1"
                        />
                        <mat-hint
                          >Daily post target: -1=unlimited, 0=disabled, n>0=~n
                          posts/day</mat-hint
                        >
                      </mat-form-field>
                    </div>

                    @if (
                      getFilteredOptions() &&
                      Object.keys(getFilteredOptions()).length > 0
                    ) {
                      <div class="aggregator-options-section">
                        <h4>Aggregator Options</h4>
                        @for (
                          optionEntry of Object.entries(getFilteredOptions());
                          track optionEntry[0]
                        ) {
                          @let optionKey = optionEntry[0];
                          @let option = optionEntry[1];
                          @let fieldName = "option_" + optionKey;

                          @if (
                            feedFormGroup.get(fieldName) &&
                            option.type === "boolean"
                          ) {
                            <mat-checkbox [formControlName]="fieldName">
                              {{ option.label }}
                            </mat-checkbox>
                            @if (option.helpText) {
                              <p class="option-help-text">
                                {{ option.helpText }}
                              </p>
                            }
                          } @else if (
                            feedFormGroup.get(fieldName) &&
                            option.type === "choice"
                          ) {
                            <mat-form-field
                              appearance="outline"
                              class="full-width"
                            >
                              <mat-label>{{ option.label }}</mat-label>
                              <mat-select [formControlName]="fieldName">
                                @if (!option.required) {
                                  <mat-option [value]="null">None</mat-option>
                                }
                                @for (
                                  choice of option.choices;
                                  track choice[0]
                                ) {
                                  <mat-option [value]="choice[0]">{{
                                    choice[1]
                                  }}</mat-option>
                                }
                              </mat-select>
                              @if (option.helpText) {
                                <mat-hint>{{ option.helpText }}</mat-hint>
                              }
                            </mat-form-field>
                          } @else if (
                            feedFormGroup.get(fieldName) &&
                            option.type === "password"
                          ) {
                            <mat-form-field
                              appearance="outline"
                              class="full-width"
                            >
                              <mat-label>{{ option.label }}</mat-label>
                              <input
                                matInput
                                type="password"
                                [formControlName]="fieldName"
                              />
                              @if (option.helpText) {
                                <mat-hint>{{ option.helpText }}</mat-hint>
                              }
                            </mat-form-field>
                          } @else if (
                            feedFormGroup.get(fieldName) &&
                            (option.type === "integer" ||
                              option.type === "float")
                          ) {
                            <mat-form-field
                              appearance="outline"
                              class="full-width"
                            >
                              <mat-label>{{ option.label }}</mat-label>
                              <input
                                matInput
                                [type]="
                                  option.type === 'integer'
                                    ? 'number'
                                    : 'number'
                                "
                                [formControlName]="fieldName"
                                [min]="option.min"
                                [max]="option.max"
                                [step]="option.type === 'float' ? '0.01' : '1'"
                              />
                              @if (option.helpText) {
                                <mat-hint>{{ option.helpText }}</mat-hint>
                              }
                            </mat-form-field>
                          } @else if (feedFormGroup.get(fieldName)) {
                            @let widgetType = option.widget || "text";
                            @if (widgetType === "textarea") {
                              <mat-form-field
                                appearance="outline"
                                class="full-width"
                              >
                                <mat-label>{{ option.label }}</mat-label>
                                <textarea
                                  matInput
                                  [formControlName]="fieldName"
                                  [rows]="5"
                                ></textarea>
                                @if (option.helpText) {
                                  <mat-hint>{{ option.helpText }}</mat-hint>
                                }
                              </mat-form-field>
                            } @else {
                              <mat-form-field
                                appearance="outline"
                                class="full-width"
                              >
                                <mat-label>{{ option.label }}</mat-label>
                                <input matInput [formControlName]="fieldName" />
                                @if (option.helpText) {
                                  <mat-hint>{{ option.helpText }}</mat-hint>
                                }
                              </mat-form-field>
                            }
                          }
                        }
                      </div>
                    }

                    @if (hasOpenAICredentials() && !isManagedAggregator()) {
                      <div class="ai-options-section">
                        <h4>AI Features</h4>
                        <p class="section-description">
                          AI-powered content processing. Leave fields empty to
                          disable. Order: Summarization → Translation → Custom
                          Prompt.
                        </p>

                        <mat-checkbox formControlName="ai_summarize">
                          Generate AI summary
                        </mat-checkbox>
                        <p class="option-help-text">
                          Generate AI summary of article content
                        </p>

                        <mat-form-field appearance="outline" class="full-width">
                          <mat-label>Translate to language</mat-label>
                          <input
                            matInput
                            formControlName="ai_translate_to"
                            maxlength="10"
                          />
                          <mat-hint
                            >Target language code (e.g., 'en', 'de', 'es').
                            Leave empty to disable translation.</mat-hint
                          >
                        </mat-form-field>

                        <mat-form-field appearance="outline" class="full-width">
                          <mat-label>Custom AI prompt</mat-label>
                          <textarea
                            matInput
                            formControlName="ai_custom_prompt"
                            [rows]="4"
                            maxlength="500"
                          ></textarea>
                          <mat-hint
                            >Custom AI prompt to process article content. Leave
                            empty to disable.</mat-hint
                          >
                        </mat-form-field>
                      </div>
                    }
                  }

                  <div class="step-actions">
                    <button mat-button matStepperPrevious>Back</button>
                    <button
                      mat-raised-button
                      color="primary"
                      matStepperNext
                      [disabled]="!feedFormGroup.valid"
                    >
                      Next
                    </button>
                  </div>
                </form>
              </mat-step>

              <!-- Step 3: Preview & Test -->
              <mat-step>
                <ng-template matStepLabel>Preview</ng-template>

                <h3>Test Feed Configuration</h3>
                <p class="muted">
                  Preview the first article from this feed with full content to
                  verify the configuration is correct.
                </p>

                @if (!previewResponse() || previewing()) {
                  <!-- Loading state -->
                  <div class="preview-loading">
                    <mat-spinner diameter="40"></mat-spinner>
                    <p>Fetching article...</p>
                    <p class="muted">This may take up to a minute</p>
                  </div>
                } @else if (!previewResponse()!.success) {
                  <!-- Error state -->
                  <div class="preview-error">
                    <mat-icon color="warn">error</mat-icon>
                    <h4>Preview Failed</h4>
                    <p class="error-message">{{ previewResponse()!.error }}</p>
                    <div class="error-actions">
                      <button
                        mat-button
                        color="primary"
                        matStepperPrevious
                        class="back-button"
                      >
                        Back to Edit
                      </button>
                      <button
                        mat-raised-button
                        color="accent"
                        (click)="previewFeed()"
                        class="retry-button"
                      >
                        <mat-icon>refresh</mat-icon>
                        Try Again
                      </button>
                    </div>
                  </div>
                } @else {
                  <!-- Success state - show articles -->
                  <div class="preview-success">
                    <div class="success-header">
                      <mat-icon color="primary">check_circle</mat-icon>
                      <p>Found article</p>
                    </div>

                    <div class="preview-articles">
                      @for (
                        article of previewResponse()!.articles;
                        track article.link
                      ) {
                        <mat-card class="preview-article-card">
                          <mat-card-header>
                            @if (article.thumbnailUrl) {
                              <img
                                mat-card-avatar
                                [src]="article.thumbnailUrl"
                                [alt]="article.title"
                              />
                            }
                            <mat-card-title>{{ article.title }}</mat-card-title>
                            @if (article.author) {
                              <mat-card-subtitle
                                >by {{ article.author }}</mat-card-subtitle
                              >
                            }
                          </mat-card-header>
                          <mat-card-content>
                            @if (isYouTubeVideo(article)) {
                              <div class="media-container">
                                <iframe
                                  [src]="getYouTubeEmbedUrl(article)"
                                  frameborder="0"
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  allowfullscreen
                                >
                                </iframe>
                              </div>
                            }
                            <div
                              class="article-content"
                              [innerHTML]="article.content"
                            ></div>
                            @if (article.published) {
                              <p class="article-date muted">
                                {{ article.published }}
                              </p>
                            }
                          </mat-card-content>
                        </mat-card>
                      }
                    </div>

                    @if (creating()) {
                      <div class="preview-loading">
                        <mat-spinner diameter="40"></mat-spinner>
                        <p>
                          {{
                            isEditMode()
                              ? "Updating feed..."
                              : "Creating feed..."
                          }}
                        </p>
                      </div>
                    }

                    <div class="step-actions">
                      <button
                        mat-button
                        color="primary"
                        matStepperPrevious
                        [disabled]="creating()"
                        class="back-button"
                      >
                        Back to Edit
                      </button>
                      <button
                        mat-raised-button
                        color="primary"
                        (click)="createFeed()"
                        [disabled]="creating()"
                      >
                        {{ isEditMode() ? "Update Feed" : "Create Feed" }}
                      </button>
                    </div>
                  </div>
                }
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
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 24px 20px 16px 20px;
        background: linear-gradient(
          180deg,
          var(--mat-sys-surface-variant) 0%,
          transparent 100%
        );
      }

      .aggregator-icon {
        width: 64px;
        height: 64px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 12px;
        position: relative;
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
      }

      .aggregator-card mat-card-subtitle {
        font-size: 0.75rem !important;
        opacity: 0.6;
        margin: 0 !important;
        font-family: monospace;
        color: var(--mat-sys-on-surface) !important;
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
          flex-direction: column;
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
  private breadcrumbService = inject(BreadcrumbService);
  private trpc = inject(TRPCService);
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

  // Subreddit search
  subredditSearchResults = signal<
    Array<{ name: string; displayName: string; title: string }>
  >([]);
  searchingSubreddits = signal<boolean>(false);
  private subredditSearchTimeout: any = null;

  // YouTube channel search
  channelSearchResults = signal<
    Array<{
      channelId: string;
      title: string;
      description: string;
      thumbnailUrl: string | null;
      subscriberCount: number;
      handle: string | null;
    }>
  >([]);
  searchingChannels = signal<boolean>(false);
  private channelSearchTimeout: any = null;

  // Group selection with autocomplete
  groupInputControl = new FormControl<string>("");
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

  feedFormGroup: FormGroup = this.fb.group({
    name: ["", Validators.required],
    identifier: ["", Validators.required],
    enabled: [true],
    generate_title_image: [true],
    add_source_footer: [true],
    skip_duplicates: [true],
    use_current_timestamp: [true],
    daily_post_limit: [50],
    // AI features
    ai_translate_to: [""],
    ai_summarize: [false],
    ai_custom_prompt: [""],
    groupIds: [[]],
  });

  ngOnInit() {
    // Check if user has OpenAI credentials
    this.userSettingsService.getSettings().subscribe({
      next: (settings) => {
        this.hasOpenAICredentials.set(settings.openai_enabled);
      },
      error: () => {
        this.hasOpenAICredentials.set(false);
      },
    });

    // Load groups
    this.groupService.loadGroups().subscribe({
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
    this.aggregatorService.loadAggregators().subscribe();
  }

  loadFeedForEdit(id: number) {
    this.loadingFeed.set(true);
    this.feedService.getFeed(id).subscribe({
      next: (feed) => {
        this.loadingFeed.set(false);
        // Update breadcrumb with feed name
        this.breadcrumbService.setLabel(`id:${feed.id}`, feed.name);
        // Load aggregators first, then populate form
        this.aggregatorService.loadAggregators().subscribe(() => {
          // Set aggregator type
          this.aggregatorFormGroup.patchValue({
            aggregatorType: feed.aggregator,
          });

          // Load aggregator detail and populate form
          this.aggregatorService
            .getAggregatorDetail(feed.aggregator)
            .subscribe((detail) => {
              this.aggregatorDetail.set(detail);
              const agg = this.aggregatorService.getAggregator(feed.aggregator);
              this.selectedAggregator.set(agg);

              // Load feed groups
              this.groupService.getFeedGroups(feed.id).subscribe({
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
              const identifierControl = this.feedFormGroup.get("identifier");
              if (identifierControl) {
                if (!detail.identifierEditable && !detail.identifierChoices) {
                  identifierControl.disable();
                } else {
                  identifierControl.enable();
                }
              }

              // Clear existing option fields
              Object.keys(this.feedFormGroup.controls).forEach((key) => {
                if (key.startsWith("option_")) {
                  this.feedFormGroup.removeControl(key);
                }
              });

              // Add option fields dynamically and populate with existing values (filtered for managed aggregators)
              const filteredOptions = this.getFilteredOptions();
              if (filteredOptions) {
                Object.entries(filteredOptions).forEach(([key, option]) => {
                  const fieldName = `option_${key}`;
                  const validators = option.required
                    ? [Validators.required]
                    : [];
                  const existingValue =
                    feed.aggregatorOptions?.[key] ?? option.default;

                  // Add JSON validation for json widget type
                  if (option.widget === "json") {
                    validators.push((control: AbstractControl) => {
                      if (!control.value || control.value.trim() === "") {
                        return null; // Empty is valid (will use default)
                      }
                      try {
                        JSON.parse(control.value);
                        return null;
                      } catch (e) {
                        return { jsonInvalid: true };
                      }
                    });
                  }

                  if (option.type === "boolean") {
                    this.feedFormGroup.addControl(
                      fieldName,
                      this.fb.control(existingValue ?? false),
                    );
                  } else if (
                    option.type === "integer" ||
                    option.type === "float"
                  ) {
                    this.feedFormGroup.addControl(
                      fieldName,
                      this.fb.control(existingValue ?? null, validators),
                    );
                  } else {
                    this.feedFormGroup.addControl(
                      fieldName,
                      this.fb.control(existingValue ?? "", validators),
                    );
                  }
                });
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
      this.feedFormGroup.patchValue({
        name: "",
        identifier: "",
      });

      // Fetch aggregator detail for identifier configuration and options
      this.aggregatorService
        .getAggregatorDetail(modulePath)
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

          // Clear existing option fields
          Object.keys(this.feedFormGroup.controls).forEach((key) => {
            if (key.startsWith("option_")) {
              this.feedFormGroup.removeControl(key);
            }
          });

          // Add option fields dynamically (filtered for managed aggregators)
          const filteredOptions = this.getFilteredOptions();
          if (filteredOptions) {
            Object.entries(filteredOptions).forEach(([key, option]) => {
              const fieldName = `option_${key}`;
              const validators = option.required ? [Validators.required] : [];

              if (option.type === "boolean") {
                this.feedFormGroup.addControl(
                  fieldName,
                  this.fb.control(option.default || false),
                );
              } else if (option.type === "integer" || option.type === "float") {
                this.feedFormGroup.addControl(
                  fieldName,
                  this.fb.control(option.default || null, validators),
                );
              } else {
                this.feedFormGroup.addControl(
                  fieldName,
                  this.fb.control(option.default || "", validators),
                );
              }
            });
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
  getFilteredOptions(): Record<string, any> {
    const detail = this.aggregatorDetail();
    if (!detail?.options) {
      return {};
    }

    // For managed aggregators, filter out restricted options
    if (this.isManagedAggregator()) {
      const restrictedOptions = [
        "exclude_selectors",
        "ignore_content_contains",
        "ignore_title_contains",
        "regex_replacements",
      ];
      const filtered: Record<string, any> = {};
      Object.entries(detail.options).forEach(([key, value]) => {
        if (!restrictedOptions.includes(key)) {
          filtered[key] = value;
        }
      });
      return filtered;
    }

    return detail.options;
  }

  previewFeed() {
    if (!this.aggregatorFormGroup.valid || !this.feedFormGroup.valid) {
      return;
    }

    this.previewing.set(true);
    this.previewResponse.set(null);

    // Collect aggregator options (filtered for managed aggregators)
    const aggregatorOptions: Record<string, any> = {};
    const filteredOptions = this.getFilteredOptions();
    if (filteredOptions) {
      Object.keys(filteredOptions).forEach((key) => {
        const fieldName = `option_${key}`;
        const value = this.feedFormGroup.get(fieldName)?.value;
        if (value !== null && value !== undefined && value !== "") {
          aggregatorOptions[key] = value;
        }
      });
    }

    // Determine feed type from aggregator
    const agg = this.selectedAggregator();
    const feedType = agg?.feedType || "article";

    const previewData = {
      name: this.feedFormGroup.get("name")?.value!,
      identifier: this.feedFormGroup.get("identifier")?.value!,
      aggregator: this.aggregatorFormGroup.get("aggregatorType")?.value!,
      feedType: feedType,
      enabled: this.feedFormGroup.get("enabled")?.value || true,
      generateTitleImage:
        this.feedFormGroup.get("generate_title_image")?.value ?? true,
      addSourceFooter:
        this.feedFormGroup.get("add_source_footer")?.value ?? true,
      skipDuplicates: this.feedFormGroup.get("skip_duplicates")?.value ?? true,
      useCurrentTimestamp:
        this.feedFormGroup.get("use_current_timestamp")?.value ?? true,
      dailyPostLimit: this.feedFormGroup.get("daily_post_limit")?.value || 50,
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

    this.feedService.previewFeed(previewData).subscribe({
      next: (response) => {
        this.previewing.set(false);
        this.previewResponse.set(response);
      },
      error: (error) => {
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
  onSubredditSearch(event: Event) {
    const input = event.target as HTMLInputElement;
    const query = input.value.trim();

    if (query.length < 2) {
      this.subredditSearchResults.set([]);
      this.searchingSubreddits.set(false);
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
        this.searchSubreddits(query);
      }
    }, 500);
  }

  /**
   * Search Reddit subreddits using TRPC.
   */
  private searchSubreddits(query: string) {
    if (query.length < 2) {
      this.subredditSearchResults.set([]);
      this.searchingSubreddits.set(false);
      return;
    }

    this.searchingSubreddits.set(true);

    from(
      this.trpc.client.aggregator.searchSubreddits.query({
        query: query,
        limit: 25,
      }),
    )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (results) => {
          this.subredditSearchResults.set(
            results.map((r) => ({
              name: r.name,
              displayName: r.displayName,
              title: r.title,
            })),
          );
          this.searchingSubreddits.set(false);
        },
        error: (error) => {
          console.error("Error searching subreddits:", error);
          this.subredditSearchResults.set([]);
          this.searchingSubreddits.set(false);
        },
      });
  }

  /**
   * Display function for subreddit autocomplete.
   */
  displaySubreddit(
    subreddit:
      | string
      | { name: string; displayName: string; title: string }
      | null,
  ): string {
    if (!subreddit) {
      return "";
    }
    // If it's already a string (the name), return it
    if (typeof subreddit === "string") {
      return subreddit;
    }
    // If it's an object, return the name
    return subreddit.name || "";
  }

  /**
   * Handle subreddit selection from autocomplete.
   */
  onSubredditSelected(event: any) {
    const subreddit = event.option.value;
    if (subreddit) {
      this.feedFormGroup.patchValue({ identifier: subreddit });
    }
  }

  /**
   * Handle channel search input.
   */
  onChannelSearch(event: Event) {
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
        this.searchChannels(query);
      }
    }, 500);
  }

  /**
   * Search YouTube channels using TRPC.
   */
  private searchChannels(query: string) {
    if (query.length < 2) {
      this.channelSearchResults.set([]);
      this.searchingChannels.set(false);
      return;
    }

    this.searchingChannels.set(true);

    from(
      this.trpc.client.aggregator.searchChannels.query({
        query: query,
        limit: 25,
      }),
    )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (results) => {
          this.channelSearchResults.set(results);
          this.searchingChannels.set(false);
        },
        error: (error) => {
          console.error("Error searching YouTube channels:", error);
          this.channelSearchResults.set([]);
          this.searchingChannels.set(false);
        },
      });
  }

  /**
   * Display function for channel autocomplete.
   */
  displayChannel(
    channel:
      | string
      | {
          channelId: string;
          title: string;
          handle: string | null;
        }
      | null,
  ): string {
    if (!channel) {
      return "";
    }
    // If it's already a string, return it as-is (could be handle, channelId, or URL)
    if (typeof channel === "string") {
      return channel;
    }
    // If it's an object, return the handle (with @) or channelId
    return channel.handle ? `@${channel.handle}` : channel.channelId;
  }

  /**
   * Handle channel selection from autocomplete.
   */
  onChannelSelected(event: any) {
    const channel = event.option.value;
    if (channel && typeof channel === "object") {
      // Prefer handle if available, otherwise use channelId
      // The YouTube aggregator can resolve both
      const identifier = channel.handle
        ? `@${channel.handle}`
        : channel.channelId;
      this.feedFormGroup.patchValue({ identifier });
    }
  }

  /**
   * Format subscriber count for display.
   */
  formatSubscriberCount(count: number): string {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M subscribers`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K subscribers`;
    }
    return `${count} subscribers`;
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
    this.groupService.createGroup(name).subscribe({
      next: (group) => {
        // Wait for groups to reload, then add to selection
        this.groupService.loadGroups().subscribe({
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
  onGroupSelected(event: any): void {
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
      return this.sanitizer.bypassSecurityTrustResourceUrl(article.mediaUrl);
    }

    // Extract video ID from standard YouTube URLs
    const videoIdMatch = article.link.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/]+)/,
    );
    if (videoIdMatch && videoIdMatch[1]) {
      const videoId = videoIdMatch[1];
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
    const aggregatorOptions: Record<string, any> = {};
    const filteredOptions = this.getFilteredOptions();
    if (filteredOptions) {
      Object.keys(filteredOptions).forEach((key) => {
        const fieldName = `option_${key}`;
        const value = this.feedFormGroup.get(fieldName)?.value;
        if (value !== null && value !== undefined && value !== "") {
          aggregatorOptions[key] = value;
        }
      });
    }

    // Determine feed type from aggregator
    const agg = this.selectedAggregator();
    const feedType = agg?.feedType || "article";

    // Filter out invalid group IDs (must be positive integers > 0)
    const groupIds = (this.selectedGroupIds() || []).filter(
      (id) => typeof id === "number" && Number.isInteger(id) && id > 0,
    );

    const feedData = {
      name: this.feedFormGroup.get("name")?.value!,
      identifier: this.feedFormGroup.get("identifier")?.value!,
      aggregator: this.aggregatorFormGroup.get("aggregatorType")?.value!,
      feedType: feedType,
      enabled: this.feedFormGroup.get("enabled")?.value || true,
      generateTitleImage:
        this.feedFormGroup.get("generate_title_image")?.value ?? true,
      addSourceFooter:
        this.feedFormGroup.get("add_source_footer")?.value ?? true,
      skipDuplicates: this.feedFormGroup.get("skip_duplicates")?.value ?? true,
      useCurrentTimestamp:
        this.feedFormGroup.get("use_current_timestamp")?.value ?? true,
      dailyPostLimit: this.feedFormGroup.get("daily_post_limit")?.value || 50,
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

    if (this.isEditMode() && this.feedId()) {
      // Update existing feed
      this.feedService.updateFeed(this.feedId()!, feedData).subscribe({
        next: (feed) => {
          this.creating.set(false);
          this.snackBar.open(`Updated feed: ${feed.name}`, "Close", {
            duration: 3000,
            panelClass: ["success-snackbar"],
          });
          this.router.navigate(["/feeds", feed.id]);
        },
        error: (error) => {
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
