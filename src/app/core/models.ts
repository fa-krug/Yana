/**
 * Core models matching backend API schemas.
 * These will be replaced with auto-generated types once the API client is generated.
 */

// User models
export interface User {
  id: number;
  username: string;
  email: string;
  isSuperuser: boolean;
  isStaff: boolean;
}

export interface AuthStatus {
  authenticated: boolean;
  user: User | null;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  user: User | null;
}

// Feed models
export interface Feed {
  id: number;
  name: string;
  identifier: string;
  feedType: 'article' | 'youtube' | 'podcast' | 'reddit';
  icon?: string;
  aggregator: string;
  enabled: boolean;
  generateTitleImage: boolean;
  addSourceFooter: boolean;
  skipDuplicates: boolean;
  useCurrentTimestamp: boolean;
  dailyPostLimit: number;
  aggregatorOptions: Record<string, any>;
  userId?: number;
  createdAt: string;
  updatedAt: string;
  articleCount?: number;
  unreadCount?: number;
  description?: string;
  lastAggregated?: string;
  // AI features
  aiTranslateTo?: string;
  aiSummarize?: boolean;
  aiCustomPrompt?: string;
}

export interface FeedCreateRequest {
  name: string;
  identifier: string;
  feedType: 'article' | 'youtube' | 'podcast' | 'reddit';
  aggregator: string;
  icon?: string;
  enabled?: boolean;
  generateTitleImage?: boolean;
  addSourceFooter?: boolean;
  skipDuplicates?: boolean;
  useCurrentTimestamp?: boolean;
  dailyPostLimit?: number;
  aggregatorOptions?: Record<string, any>;
  // AI features
  aiTranslateTo?: string;
  aiSummarize?: boolean;
  aiCustomPrompt?: string;
}

export interface FeedPreviewRequest extends FeedCreateRequest {
  // Same as FeedCreateRequest - used for preview endpoint
}

export interface PreviewArticle {
  title: string;
  content: string;
  published?: string;
  author?: string;
  thumbnailUrl?: string;
  link: string;
}

export interface FeedPreviewResponse {
  success: boolean;
  articles: PreviewArticle[];
  count: number;
  error?: string;
  errorType?: 'validation' | 'network' | 'parse' | 'authentication' | 'timeout' | 'unknown';
}

// Article models
export interface Article {
  id: number;
  feedId: number;
  name: string;
  url: string;
  date: string;
  content: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  duration?: number;
  viewCount?: number;
  mediaType?: string;
  author?: string;
  externalId?: string;
  score?: number;
  isVideo: boolean;
  isPodcast: boolean;
  isReddit: boolean;
  hasMedia: boolean;
  durationFormatted?: string;
  isRead: boolean;
  isSaved: boolean;
  createdAt: string;
  updatedAt: string;
  // Frontend-friendly aliases
  read?: boolean;
  saved?: boolean;
  title?: string;
  published?: string;
  link?: string;
  summary?: string;
}

export interface ArticleDetail extends Article {
  feedName: string;
  feedIcon?: string;
  prevArticleId?: number;
  nextArticleId?: number;
  // Frontend-friendly aliases
  prevId?: number;
  nextId?: number;
  feed?: {
    id: number;
    name: string;
    feedType: string;
  };
}

// Aggregator models
export interface Aggregator {
  id: string;
  name: string;
  type: 'managed' | 'social' | 'custom';
  description?: string;
  url?: string;
  icon?: string;
  feedType?: 'article' | 'youtube' | 'podcast' | 'reddit';
  enabled: boolean;
  // Frontend-friendly alias
  modulePath?: string;
}

export interface AggregatorList {
  managed: Aggregator[];
  social: Aggregator[];
  custom: Aggregator[];
}

export interface AggregatorOption {
  type: 'boolean' | 'integer' | 'float' | 'string' | 'password' | 'choice';
  label: string;
  helpText?: string;
  default?: any;
  required?: boolean;
  min?: number;
  max?: number;
  choices?: string[][];
  widget?: 'text' | 'textarea' | 'json';
}

export interface AggregatorDetail {
  id: string;
  identifierType: 'url' | 'string';
  identifierLabel: string;
  identifierDescription: string;
  identifierPlaceholder: string;
  identifierChoices?: string[][];
  identifierEditable?: boolean;
  options: Record<string, AggregatorOption>;
}

// Statistics models
export interface Statistics {
  totalFeeds: number;
  totalArticles: number;
  totalUnread: number;
  readPercentage: number;
  articleFeeds: number;
  videoFeeds: number;
  podcastFeeds: number;
  redditFeeds: number;
  articlesToday: number;
  articlesThisWeek: number;
}

// Pagination - matches Django Ninja PageNumberPagination format
export interface PaginatedResponse<T> {
  items: T[];
  count: number;
  page: number;
  pageSize: number;
  pages?: number;
}
