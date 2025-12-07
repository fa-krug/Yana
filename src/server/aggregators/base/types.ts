/**
 * Base types for aggregator system.
 */

export interface RawArticle {
  title: string;
  url: string;
  published: Date;
  content?: string;
  summary?: string;
  author?: string;
  externalId?: string;
  score?: number;
  thumbnailUrl?: string;
  mediaUrl?: string;
  duration?: number;
  viewCount?: number;
  mediaType?: string;
}

export interface AggregatorOptions {
  [key: string]: unknown;
}

export interface AggregatorMetadata {
  id: string;
  type: 'managed' | 'custom' | 'social';
  name: string;
  url: string;
  description: string;
  identifierType?: 'url' | 'string';
  identifierLabel?: string;
  identifierDescription?: string;
  identifierPlaceholder?: string;
  identifierChoices?: Array<[string, string]>;
  identifierEditable?: boolean;
  feedType?: 'article' | 'youtube' | 'podcast' | 'reddit';
  icon?: string;
}

export interface OptionDefinition {
  type: 'boolean' | 'integer' | 'string' | 'choice' | 'float' | 'password';
  label: string;
  helpText?: string;
  default?: boolean | number | string | null;
  required?: boolean;
  min?: number;
  max?: number;
  choices?: Array<[string, string]>;
  widget?: 'text' | 'textarea' | 'json';
}

export interface OptionsSchema {
  [key: string]: OptionDefinition;
}
