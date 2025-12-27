/**
 * Feed config step component - step 2 of feed creation form (feed configuration).
 */

import { CommonModule } from "@angular/common";
import { Component, computed, input, output } from "@angular/core";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatStepperModule } from "@angular/material/stepper";

import {
  AggregatorDetail,
  Aggregator,
  Group,
  AggregatorOption,
} from "@app/core/models";
import {
  SubredditSearchResult,
  ChannelSearchResult,
} from "@app/core/services/feed-form-search.service";

import { AggregatorOptionsComponent } from "./aggregator-options.component";
import { AIOptionsComponent } from "./ai-options.component";
import { GroupsSelectorComponent } from "./groups-selector.component";
import { IdentifierFieldComponent } from "./identifier-field.component";

@Component({
  selector: "app-feed-config-step",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatStepperModule,
    IdentifierFieldComponent,
    GroupsSelectorComponent,
    AggregatorOptionsComponent,
    AIOptionsComponent,
  ],
  template: `
    <form [formGroup]="feedFormGroup()">
      <ng-template matStepLabel>Config</ng-template>

      <h3>Feed Configuration</h3>

      @if (aggregatorDetail()) {
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Feed Name</mat-label>
          <input matInput formControlName="name" />
          <mat-hint>A descriptive name for this feed</mat-hint>
        </mat-form-field>

        <app-identifier-field
          [aggregatorDetail]="aggregatorDetail()"
          [selectedAggregator]="selectedAggregator()"
          [identifierControl]="identifierControl()"
          [isEditable]="isIdentifierEditable()"
          [searchingSubreddits]="searchingSubreddits()"
          [searchingChannels]="searchingChannels()"
          [subredditSearchResults]="subredditSearchResults()"
          [channelSearchResults]="channelsForIdentifier()"
          (subredditSearch)="onSubredditSearch($event)"
          (subredditSelected)="onSubredditSelected($event)"
          (channelSearch)="onChannelSearch($event)"
          (channelSelected)="onChannelSelected($event)"
        />

        <app-groups-selector
          [groupInputControl]="groupInputControl()"
          [selectedGroupIds]="selectedGroupIds()"
          [filteredGroups]="filteredGroups()"
          [creatingGroup]="creatingGroup()"
          [allGroups]="allGroups()"
          (groupSelected)="onGroupSelected($event)"
          (groupRemoved)="onGroupRemoved($event)"
          (groupInputEnter)="onGroupInputEnter($event)"
          (createGroupFromInput)="onCreateGroupFromInput()"
        />

        <div class="general-options-section">
          <h4>General Options</h4>

          <mat-checkbox formControlName="enabled">Enabled</mat-checkbox>
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

        <app-aggregator-options
          [feedFormGroup]="feedFormGroup()"
          [filteredOptions]="filteredOptions()"
        />

        <app-ai-options
          [showAIOptions]="showAIOptions()"
          [aiSummarizeControl]="aiSummarizeControl()"
          [aiTranslateToControl]="aiTranslateToControl()"
          [aiCustomPromptControl]="aiCustomPromptControl()"
        />
      }

      <div class="step-actions">
        <button mat-button matStepperPrevious>Back</button>
        <button
          mat-raised-button
          color="primary"
          matStepperNext
          [disabled]="!feedFormGroup().valid"
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

      .full-width {
        width: 100%;
        margin-bottom: 16px;
      }

      .general-options-section {
        margin: 24px 0;
        padding: 16px;
        background: rgba(0, 0, 0, 0.02);
        border-radius: 8px;
      }

      .general-options-section h4 {
        margin: 0 0 16px 0;
        font-size: 1.125rem;
        font-weight: 500;
      }

      .option-help-text {
        margin: 4px 0 16px 0;
        color: rgba(0, 0, 0, 0.6);
        font-size: 0.875rem;
        line-height: 1.5;
      }

      mat-checkbox {
        display: block;
        margin-bottom: 8px;
      }

      .step-actions {
        display: flex;
        justify-content: space-between;
        margin-top: 24px;
        gap: 12px;
      }
    `,
  ],
})
export class FeedConfigStepComponent {
  readonly feedFormGroup = input.required<FormGroup>();
  readonly aggregatorDetail = input.required<AggregatorDetail | null>();
  readonly selectedAggregator = input.required<Aggregator | null>();
  readonly identifierControl = input.required<FormControl<string | null>>();
  readonly isIdentifierEditable = input.required<boolean>();
  readonly searchingSubreddits = input.required<boolean>();
  readonly searchingChannels = input.required<boolean>();
  readonly subredditSearchResults = input.required<SubredditSearchResult[]>();
  readonly channelSearchResults = input.required<ChannelSearchResult[]>();
  readonly groupInputControl = input.required<FormControl<string | null>>();
  readonly selectedGroupIds = input.required<number[]>();
  readonly filteredGroups = input.required<Group[]>();
  readonly creatingGroup = input.required<boolean>();
  readonly allGroups = input.required<Group[]>();
  readonly filteredOptions = input.required<Record<
    string,
    AggregatorOption
  > | null>();
  readonly showAIOptions = input.required<boolean>();
  readonly aiSummarizeControl = input.required<FormControl>();
  readonly aiTranslateToControl = input.required<FormControl>();
  readonly aiCustomPromptControl = input.required<FormControl>();

  readonly subredditSearch = output<Event>();
  readonly subredditSelected = output<string | SubredditSearchResult | null>();
  readonly channelSearch = output<Event>();
  readonly channelSelected = output<string | ChannelSearchResult | null>();
  readonly groupSelected = output<Group>();

  // Convert ChannelSearchResult[] to Channel[] for identifier-field component
  readonly channelsForIdentifier = computed(() => {
    return this.channelSearchResults().map((result) => ({
      channelId: result.channelId,
      title: result.title,
      handle: result.handle,
      thumbnailUrl: result.thumbnailUrl ?? undefined,
      subscriberCount: result.subscriberCount,
    }));
  });
  readonly groupRemoved = output<number>();
  readonly groupInputEnter = output<Event>();
  readonly createGroupFromInput = output<void>();

  protected onSubredditSearch(event: Event): void {
    this.subredditSearch.emit(event);
  }

  protected onSubredditSelected(
    subreddit:
      | string
      | { name: string; displayName: string; title: string }
      | { option: { value: string | { name: string } } }
      | null,
  ): void {
    const value =
      typeof subreddit === "object" && subreddit && "option" in subreddit
        ? subreddit.option.value
        : subreddit;
    this.subredditSelected.emit(
      value as
        | string
        | { name: string; displayName: string; title: string }
        | null,
    );
  }

  protected onChannelSearch(event: Event): void {
    this.channelSearch.emit(event);
  }

  protected onChannelSelected(
    channel:
      | string
      | ChannelSearchResult
      | { channelId: string; title: string; handle: string | null }
      | {
          option: {
            value:
              | ChannelSearchResult
              | { channelId: string; handle: string | null };
          };
        }
      | null,
  ): void {
    const value =
      typeof channel === "object" && channel && "option" in channel
        ? channel.option.value
        : channel;

    // If value is a partial channel object, find the full ChannelSearchResult
    if (
      typeof value === "object" &&
      value != null &&
      "channelId" in value &&
      !("description" in value)
    ) {
      const fullResult = this.channelSearchResults().find(
        (r) => r.channelId === value.channelId,
      );
      this.channelSelected.emit(fullResult ?? (value as ChannelSearchResult));
    } else {
      this.channelSelected.emit(value as string | ChannelSearchResult | null);
    }
  }

  protected onGroupSelected(event: { option: { value: Group } } | Group): void {
    const group =
      typeof event === "object" && event != null && "option" in event
        ? event.option.value
        : event;
    if (group && typeof group === "object" && "id" in group && group.id) {
      this.groupSelected.emit(group);
    }
  }

  protected onGroupRemoved(groupId: number): void {
    this.groupRemoved.emit(groupId);
  }

  protected onGroupInputEnter(event: Event): void {
    this.groupInputEnter.emit(event);
  }

  protected onCreateGroupFromInput(): void {
    this.createGroupFromInput.emit();
  }
}
