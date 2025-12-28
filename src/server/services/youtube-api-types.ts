/**
 * YouTube API response types.
 */

export interface YouTubeThumbnail {
  url: string;
}

export interface YouTubeThumbnails {
  default?: YouTubeThumbnail;
  medium?: YouTubeThumbnail;
  high?: YouTubeThumbnail;
  standard?: YouTubeThumbnail;
  maxres?: YouTubeThumbnail;
}

export interface YouTubeSnippet {
  title?: string;
  description?: string;
  customUrl?: string;
  handle?: string;
  thumbnails?: YouTubeThumbnails;
}

export interface YouTubeStatistics {
  subscriberCount?: string | number;
}

export interface YouTubeChannelDetails {
  id: string;
  snippet?: YouTubeSnippet;
  statistics?: YouTubeStatistics;
}

export interface YouTubeSearchItem {
  id: {
    kind?: string;
    channelId: string;
  };
  snippet?: YouTubeSnippet;
}

export interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[];
  nextPageToken?: string;
}
