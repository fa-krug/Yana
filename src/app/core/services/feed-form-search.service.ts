/**
 * Service for handling search operations in feed form (subreddits, YouTube channels).
 */

import { Injectable, signal } from "@angular/core";
import { from } from "rxjs";
import { TRPCService } from "../trpc/trpc.service";

export interface SubredditSearchResult {
  name: string;
  displayName: string;
  title: string;
}

export interface ChannelSearchResult {
  channelId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  subscriberCount: number;
  handle: string | null;
}

@Injectable({
  providedIn: "root",
})
export class FeedFormSearchService {
  constructor(private trpc: TRPCService) {}

  // Subreddit search
  subredditSearchResults = signal<SubredditSearchResult[]>([]);
  searchingSubreddits = signal<boolean>(false);

  // YouTube channel search
  channelSearchResults = signal<ChannelSearchResult[]>([]);
  searchingChannels = signal<boolean>(false);

  /**
   * Search Reddit subreddits using TRPC.
   */
  searchSubreddits(query: string): void {
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
    ).subscribe({
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
   * Search YouTube channels using TRPC.
   */
  searchChannels(query: string): void {
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
    ).subscribe({
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
   * Display function for subreddit autocomplete.
   */
  displaySubreddit(subreddit: string | SubredditSearchResult | null): string {
    if (!subreddit) {
      return "";
    }
    if (typeof subreddit === "string") {
      return subreddit;
    }
    return subreddit.name || "";
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
    if (typeof channel === "string") {
      return channel;
    }
    return channel.handle ? `@${channel.handle}` : channel.channelId;
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
}
