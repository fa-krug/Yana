/**
 * Identifier field component - handles different identifier input types (dropdown, autocomplete, text).
 */

import { CommonModule } from "@angular/common";
import { Component, input, output } from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { MatAutocompleteModule } from "@angular/material/autocomplete";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSelectModule } from "@angular/material/select";

import { AggregatorDetail, Aggregator } from "@app/core/models";

interface Subreddit {
  name: string;
  displayName: string;
  title: string;
}

interface Channel {
  channelId: string;
  title: string;
  handle: string | null;
  thumbnailUrl?: string;
  subscriberCount?: number;
}

@Component({
  selector: "app-identifier-field",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatProgressSpinnerModule,
    MatIconModule,
  ],
  template: `
    @if (aggregatorDetail()?.identifierChoices) {
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>{{ aggregatorDetail()!.identifierLabel }}</mat-label>
        <mat-select [formControl]="identifierControl()">
          @for (
            choice of aggregatorDetail()!.identifierChoices;
            track choice[0]
          ) {
            <mat-option [value]="choice[0]">{{ choice[1] }}</mat-option>
          }
        </mat-select>
        @if (aggregatorDetail()!.identifierDescription) {
          <mat-hint>{{ aggregatorDetail()!.identifierDescription }}</mat-hint>
        }
      </mat-form-field>
    } @else {
      @if (selectedAggregator()?.id === "reddit") {
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ aggregatorDetail()!.identifierLabel }}</mat-label>
          <input
            matInput
            [formControl]="identifierControl()"
            [matAutocomplete]="subredditAuto"
            [readonly]="!isEditable()"
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
            @for (subreddit of subredditSearchResults(); track subreddit.name) {
              <mat-option [value]="subreddit.name">
                <span class="subreddit-option">
                  <strong>r/{{ subreddit.displayName }}</strong>
                  @if (subreddit.title) {
                    <span class="subreddit-title">{{ subreddit.title }}</span>
                  }
                </span>
              </mat-option>
            }
            @if (
              subredditSearchResults().length === 0 &&
              !searchingSubreddits() &&
              identifierControl().value &&
              identifierControl().value!.length > 2
            ) {
              <mat-option disabled>No subreddits found</mat-option>
            }
          </mat-autocomplete>
          @if (aggregatorDetail()!.identifierDescription) {
            <mat-hint>{{ aggregatorDetail()!.identifierDescription }}</mat-hint>
          }
        </mat-form-field>
      } @else if (selectedAggregator()?.id === "youtube") {
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ aggregatorDetail()!.identifierLabel }}</mat-label>
          <input
            matInput
            [formControl]="identifierControl()"
            [matAutocomplete]="channelAuto"
            [readonly]="!isEditable()"
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
            @for (channel of channelSearchResults(); track channel.channelId) {
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
                      channel.handle ? "@" + channel.handle : channel.title
                    }}</strong>
                    @if (channel.handle && channel.title !== channel.handle) {
                      <span class="channel-title">{{ channel.title }}</span>
                    }
                    @if (
                      channel.subscriberCount && channel.subscriberCount > 0
                    ) {
                      <span class="channel-subscribers">{{
                        formatSubscriberCount(channel.subscriberCount)
                      }}</span>
                    }
                  </div>
                </span>
              </mat-option>
            }
            @if (
              channelSearchResults().length === 0 &&
              !searchingChannels() &&
              identifierControl().value &&
              identifierControl().value!.length > 2
            ) {
              <mat-option disabled>No channels found</mat-option>
            }
          </mat-autocomplete>
          @if (aggregatorDetail()!.identifierDescription) {
            <mat-hint>{{ aggregatorDetail()!.identifierDescription }}</mat-hint>
          }
        </mat-form-field>
      } @else {
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ aggregatorDetail()!.identifierLabel }}</mat-label>
          @if (aggregatorDetail()!.identifierType === "url") {
            <input
              matInput
              type="url"
              [formControl]="identifierControl()"
              [readonly]="!isEditable()"
            />
          } @else {
            <input
              matInput
              [formControl]="identifierControl()"
              [readonly]="!isEditable()"
            />
          }
          @if (aggregatorDetail()!.identifierDescription) {
            <mat-hint>{{ aggregatorDetail()!.identifierDescription }}</mat-hint>
          }
        </mat-form-field>
      }
    }
  `,
  styles: [
    `
      .full-width {
        width: 100%;
        margin-bottom: 16px;
      }

      .subreddit-option {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .subreddit-title {
        font-size: 0.875rem;
        color: rgba(0, 0, 0, 0.6);
      }

      .channel-option {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .channel-thumbnail {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        object-fit: cover;
      }

      .channel-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-width: 0;
      }

      .channel-title {
        font-size: 0.875rem;
        color: rgba(0, 0, 0, 0.6);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .channel-subscribers {
        font-size: 0.75rem;
        color: rgba(0, 0, 0, 0.5);
      }
    `,
  ],
})
export class IdentifierFieldComponent {
  readonly aggregatorDetail = input.required<AggregatorDetail | null>();
  readonly selectedAggregator = input.required<Aggregator | null>();
  readonly identifierControl = input.required<FormControl<string | null>>();
  readonly isEditable = input.required<boolean>();
  readonly searchingSubreddits = input.required<boolean>();
  readonly searchingChannels = input.required<boolean>();
  readonly subredditSearchResults = input.required<Subreddit[]>();
  readonly channelSearchResults = input.required<Channel[]>();

  readonly subredditSearch = output<Event>();
  readonly subredditSelected = output<Subreddit>();
  readonly channelSearch = output<Event>();
  readonly channelSelected = output<Channel>();

  protected displaySubreddit(value: string): string {
    return value || "";
  }

  protected displayChannel(value: Channel | string): string {
    if (typeof value === "string") {
      return value;
    }
    return value?.handle ? `@${value.handle}` : value?.title || "";
  }

  protected formatSubscriberCount(count: number): string {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M subscribers`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K subscribers`;
    }
    return `${count} subscribers`;
  }

  protected onSubredditSearch(event: Event): void {
    this.subredditSearch.emit(event);
  }

  protected onSubredditSelected(
    event: { option: { value: Subreddit | string } } | Subreddit | string,
  ): void {
    const subreddit =
      typeof event === "object" && event !== null && "option" in event
        ? event.option.value
        : event;
    if (subreddit) {
      if (typeof subreddit === "string") {
        // Convert string to Subreddit object
        this.subredditSelected.emit({
          name: subreddit,
          displayName: subreddit,
          title: subreddit,
        });
      } else {
        this.subredditSelected.emit(subreddit as Subreddit);
      }
    }
  }

  protected onChannelSearch(event: Event): void {
    this.channelSearch.emit(event);
  }

  protected onChannelSelected(
    event: { option: { value: Channel | string } } | Channel | string,
  ): void {
    const channel =
      typeof event === "object" && event !== null && "option" in event
        ? event.option.value
        : event;
    if (channel) {
      if (typeof channel === "string") {
        // Convert string to Channel object
        this.channelSelected.emit({
          channelId: channel,
          title: channel,
          handle: null,
        });
      } else {
        this.channelSelected.emit(channel as Channel);
      }
    }
  }
}
