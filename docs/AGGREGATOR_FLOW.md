# Aggregator Flow Documentation

This document describes the fixed aggregation flow implemented using the Template Method Pattern. All aggregators follow this consistent flow, with the ability to override specific steps as needed.

## Table of Contents

1. [Overview](#overview)
2. [Fixed Aggregation Flow](#fixed-aggregation-flow)
3. [Step-by-Step Breakdown](#step-by-step-breakdown)
4. [Error Handling](#error-handling)
5. [Configuration](#configuration)
6. [Debugging Tools](#debugging-tools)
7. [Creating Custom Aggregators](#creating-custom-aggregators)

## Overview

The aggregator system uses the **Template Method Pattern** to enforce a fixed, consistent flow across all aggregators while allowing each aggregator to customize specific steps. This ensures:

- **Consistency**: All aggregators follow the same flow
- **Maintainability**: Aggregator-specific logic is isolated to aggregator files
- **Debuggability**: Detailed logging at every step
- **Flexibility**: Each step can be overridden while maintaining the overall flow
- **Testability**: Each step can be tested independently

## Fixed Aggregation Flow

All aggregators follow this fixed flow:

```
1. initialize() - Initialize aggregator with feed and options (called by service)
2. validate() - Validate feed identifier/configuration
3. fetchSourceData() - Fetch RSS/API data
   a. applyRateLimiting() - Rate limit/throttle API requests (optional)
4. parseToRawArticles() - Transform source data to RawArticle[]
   a. extractMetadata() - Extract author, date, tags, etc. (optional)
5. filterArticles() - Apply skip logic, filters, limits
   a. shouldSkipArticle() - Check if article should be skipped
   b. applyArticleFilters() - Apply title/content filters
   c. applyArticleLimit() - Apply daily/aggregation limits
6. enrichArticles() - Fetch content, extract, process (per article)
   a. shouldFetchContent() - Check if content needs fetching
   b. getCachedContent() - Check cache for article content (optional)
   c. fetchArticleContent() - Fetch HTML/content (fail-fast, no retries)
   d. extractContent() - Extract main content from HTML
      i. removeElementsBySelectors() - Remove unwanted elements by CSS selectors
   e. validateContent() - Validate content quality (skip article if invalid)
   f. processContent() - Sanitize, transform, standardize
   g. extractImages() - Extract and process images (optional)
   h. setCachedContent() - Cache processed content (optional)
7. collectFeedIcon() - Collect feed icon (optional, called by service)
8. finalizeArticles() - Final validation, deduplication, sorting (optional)
9. return RawArticle[]
```

## Step-by-Step Breakdown

### 1. Initialize

**Method:** `initialize(feed, forceRefresh, options)`

Called by the aggregation service before aggregation starts. Sets up the aggregator with:
- Feed configuration
- Force refresh flag
- Runtime options

**Override:** Not typically overridden.

### 2. Validate

**Method:** `protected async validate(): Promise<void>`

Validates the feed identifier and configuration. Throws an error if invalid.

**Default behavior:** Checks that feed is initialized.

**Override when:** You need custom validation (e.g., YouTube channel ID resolution, Reddit subreddit validation).

**Example:**
```typescript
protected override async validate(): Promise<void> {
  await super.validate();
  // Custom validation logic
  if (!this.feed) throw new Error("Feed not initialized");
  // Validate identifier format, etc.
}
```

### 3. Fetch Source Data

**Method:** `protected abstract async fetchSourceData(limit?: number): Promise<unknown>`

Fetches the source data (RSS feed, API response, etc.). Must be implemented by each aggregator.

**Override:** Always implemented (abstract method).

**Example:**
```typescript
protected override async fetchSourceData(limit?: number): Promise<Parser.Output<any>> {
  const feedUrl = this.feed!.identifier;
  const feed = await fetchFeed(feedUrl);
  return feed;
}
```

#### 3a. Apply Rate Limiting

**Method:** `protected async applyRateLimiting(): Promise<void>`

Applies rate limiting before fetching. Default delay is 1000ms.

**Default behavior:** Waits for `rateLimitDelay` milliseconds (default: 1000ms).

**Override when:** You need custom rate limiting logic (e.g., respect API rate limit headers).

**Configuration:** Override `rateLimitDelay` property to change delay.

**Example:**
```typescript
readonly rateLimitDelay: number = 2000; // 2 seconds

protected override async applyRateLimiting(): Promise<void> {
  // Custom rate limiting logic
  await super.applyRateLimiting();
}
```

### 4. Parse to Raw Articles

**Method:** `protected abstract async parseToRawArticles(sourceData: unknown): Promise<RawArticle[]>`

Transforms source data into `RawArticle[]` format. Must be implemented by each aggregator.

**Override:** Always implemented (abstract method).

**Example:**
```typescript
protected override async parseToRawArticles(
  sourceData: unknown,
): Promise<RawArticle[]> {
  const feed = sourceData as Parser.Output<any>;
  return feed.items.map((item) => ({
    title: item.title || "",
    url: item.link || "",
    published: item.pubDate ? new Date(item.pubDate) : new Date(),
    summary: item.contentSnippet || "",
  }));
}
```

#### 4a. Extract Metadata

**Method:** `protected async extractMetadata(sourceData: unknown, article: RawArticle): Promise<Partial<RawArticle>>`

Extracts additional metadata (author, tags, social metrics, etc.).

**Default behavior:** Returns empty object (no metadata extraction).

**Override when:** You need to extract custom metadata from source data.

**Example:**
```typescript
protected override async extractMetadata(
  sourceData: unknown,
  article: RawArticle,
): Promise<Partial<RawArticle>> {
  // Extract custom metadata
  return {
    author: extractAuthor(sourceData),
    tags: extractTags(sourceData),
  };
}
```

### 5. Filter Articles

**Method:** `protected async filterArticles(articles: RawArticle[]): Promise<RawArticle[]>`

Applies skip logic, filters, and limits to articles.

**Default behavior:** Applies `shouldSkipArticle()`, `applyArticleFilters()`, and `applyArticleLimit()`.

**Override when:** You need custom filtering logic.

#### 5a. Should Skip Article

**Method:** `protected shouldSkipArticle(article: RawArticle): boolean`

Checks if an article should be skipped (duplicates, age, custom logic).

**Default behavior:** Checks if URL already exists (unless force refresh).

**Override when:** You need custom skip logic (e.g., Reddit AutoModerator posts, old posts).

**Example:**
```typescript
protected override shouldSkipArticle(article: RawArticle): boolean {
  if (super.shouldSkipArticle(article)) return true;
  // Custom skip logic
  if (article.author === "AutoModerator") return true;
  return false;
}
```

#### 5b. Apply Article Filters

**Method:** `protected async applyArticleFilters(articles: RawArticle[]): Promise<RawArticle[]>`

Applies title/content filters (ignore patterns, etc.).

**Default behavior:** No filtering.

**Override when:** You need custom filtering (e.g., `ignore_title_contains`, `ignore_content_contains`).

**Example:**
```typescript
protected override async applyArticleFilters(
  articles: RawArticle[],
): Promise<RawArticle[]> {
  const ignoreTitle = this.getOption("ignore_title_contains", "") as string;
  // Apply filters...
  return filtered;
}
```

#### 5c. Apply Article Limit

**Method:** `protected applyArticleLimit(articles: RawArticle[]): RawArticle[]`

Applies daily/aggregation limits.

**Default behavior:** No limit (returns all articles).

**Override when:** You need custom limit logic.

### 6. Enrich Articles

**Method:** `protected async enrichArticles(articles: RawArticle[]): Promise<RawArticle[]>`

Fetches content, extracts, validates, and processes each article. This is the main enrichment step.

**Default behavior:** Iterates through articles and:
1. Checks if content should be fetched
2. Gets cached content if available
3. Fetches article content (fail-fast)
4. Extracts content
5. Validates content (skips if invalid)
6. Processes content
7. Extracts images
8. Caches processed content

**Override when:** You need completely custom enrichment logic (rare).

#### 6a. Should Fetch Content

**Method:** `protected shouldFetchContent(article: RawArticle): boolean`

Checks if content should be fetched from the web.

**Default behavior:** Returns `true` if URL doesn't already exist or force refresh is enabled.

**Override when:** You never fetch content (e.g., RSS-only aggregator, podcast aggregator).

**Example:**
```typescript
protected override shouldFetchContent(article: RawArticle): boolean {
  // RSS-only aggregator never fetches
  return false;
}
```

#### 6b. Get Cached Content

**Method:** `protected async getCachedContent(article: RawArticle): Promise<string | null>`

Gets cached content for an article if available and not expired.

**Default behavior:** Uses LRU cache with TTL (default: 3600s, max 1000 entries). Returns `null` if force refresh or cache miss.

**Override when:** You need custom caching strategy.

**Configuration:** Override `cacheTTL` and `cacheMaxSize` properties.

**Example:**
```typescript
readonly cacheTTL: number = 7200; // 2 hours
readonly cacheMaxSize: number = 500; // 500 entries
```

#### 6c. Fetch Article Content

**Method:** `protected async fetchArticleContentInternal(url: string, article: RawArticle): Promise<string>`

Fetches HTML content from the article URL. **Fail-fast** - no retries.

**Default behavior:** Uses Playwright to fetch content with timeout and optional `waitForSelector`.

**Override when:** You need custom fetching logic (e.g., Oglaf age confirmation, multi-page articles).

**Example:**
```typescript
protected override async fetchArticleContentInternal(
  url: string,
  article: RawArticle,
): Promise<string> {
  // Custom fetching logic (e.g., handle age confirmation)
  const { html, page } = await fetchOglafContent(url, this.fetchTimeout);
  this.currentPage = page; // Store for later use
  return html;
}
```

#### 6d. Extract Content

**Method:** `protected async extractContent(html: string, article: RawArticle): Promise<string>`

Extracts main content from HTML.

**Default behavior:** Uses generic extraction with `selectorsToRemove`. Calls `removeElementsBySelectors()`.

**Override when:** You need custom extraction logic (e.g., specific content selectors, custom extraction).

**Example:**
```typescript
protected override async extractContent(
  html: string,
  article: RawArticle,
): Promise<string> {
  // Custom extraction (e.g., .entry-inner selector)
  const extracted = extractContent(html, {
    contentSelector: ".entry-inner",
    selectorsToRemove: this.selectorsToRemove,
  });
  return await super.removeElementsBySelectors(extracted, article);
}
```

##### 6d-i. Remove Elements by Selectors

**Method:** `protected async removeElementsBySelectors(html: string, article: RawArticle): Promise<string>`

Removes unwanted elements by CSS selectors.

**Default behavior:** Removes elements matching `selectorsToRemove` property.

**Override when:** You need custom selector removal logic (e.g., YouTube-specific elements).

**Example:**
```typescript
protected override async removeElementsBySelectors(
  html: string,
  article: RawArticle,
): Promise<string> {
  // Remove YouTube-specific elements
  const $ = cheerio.load(html);
  $(".ytd-app").remove();
  // Use base removal
  return await super.removeElementsBySelectors($.html(), article);
}
```

#### 6e. Validate Content

**Method:** `protected validateContent(content: string, article: RawArticle): boolean`

Validates content quality. Returns `false` to skip the article.

**Default behavior:** Checks that content is not empty and has minimum length (50 characters).

**Override when:** You need custom validation (e.g., check for meaningful content, detect low-quality articles).

**Example:**
```typescript
protected override validateContent(
  content: string,
  article: RawArticle,
): boolean {
  if (!super.validateContent(content, article)) return false;
  // Custom validation
  if (content.includes("paywall")) return false;
  return true;
}
```

#### 6f. Process Content

**Method:** `protected async processContent(html: string, article: RawArticle): Promise<string>`

Sanitizes, transforms, and standardizes content.

**Default behavior:** Sanitizes HTML and standardizes format (adds header image, source footer).

**Override when:** You need custom processing (e.g., Reddit markdown conversion, YouTube embeds, regex replacements).

**Example:**
```typescript
protected override async processContent(
  html: string,
  article: RawArticle,
): Promise<string> {
  // Custom processing (e.g., apply regex replacements)
  let processed = await super.processContent(html, article);
  const regexReplacements = this.getOption("regex_replacements", "") as string;
  if (regexReplacements) {
    processed = this.applyRegexReplacements(processed, regexReplacements);
  }
  return processed;
}
```

#### 6g. Extract Images

**Method:** `protected async extractImages(content: string, article: RawArticle): Promise<void>`

Extracts and processes images from content.

**Default behavior:** No image extraction (images are handled in `processContent`).

**Override when:** You need custom image extraction/processing.

#### 6h. Set Cached Content

**Method:** `protected async setCachedContent(article: RawArticle, content: string): Promise<void>`

Caches processed content for future use.

**Default behavior:** Stores in LRU cache with TTL.

**Override when:** You need custom caching strategy.

### 7. Collect Feed Icon

**Method:** `async collectFeedIcon(): Promise<string | null>`

Collects feed icon URL during aggregation. Called by the aggregation service.

**Default behavior:** Returns `null` (no icon).

**Override when:** You can provide a feed-specific icon (e.g., Reddit subreddit icon, YouTube channel icon).

**Example:**
```typescript
override async collectFeedIcon(): Promise<string | null> {
  return this.subredditIconUrl;
}
```

### 8. Finalize Articles

**Method:** `protected async finalizeArticles(articles: RawArticle[]): Promise<RawArticle[]>`

Performs final validation, deduplication, and sorting.

**Default behavior:** Sorts by published date (newest first).

**Override when:** You need custom finalization (e.g., custom sorting, final deduplication).

**Example:**
```typescript
protected override async finalizeArticles(
  articles: RawArticle[],
): Promise<RawArticle[]> {
  // Custom finalization
  const finalized = articles
    .filter((a) => a.content && a.content.length > 100) // Final quality check
    .sort((a, b) => (b.score || 0) - (a.score || 0)); // Sort by score
  return finalized;
}
```

## Error Handling

The aggregator system uses a **fail-fast** strategy with graceful degradation:

### Strategy

1. **No Retries**: Content fetching fails immediately without retries
2. **Fallback to Partial Data**: When possible, use partial data (summary, original RSS content)
3. **Skip Invalid Articles**: Articles that fail validation are skipped (not saved)
4. **Log All Errors**: All errors are logged with context but don't halt the entire process

### Error Handling by Step

#### Fetch Source Data Errors
- **Behavior**: Error is thrown, aggregation stops
- **Reason**: Cannot proceed without source data

#### Parse Errors
- **Behavior**: Error is thrown, aggregation stops
- **Reason**: Cannot proceed without parsed articles

#### Fetch Article Content Errors
- **Behavior**: Log error, use summary or original RSS content, continue with next article
- **Fallback**: `article.content = article.summary || ""`

#### Extract Content Errors
- **Behavior**: Log error, use original HTML, continue
- **Fallback**: Use original HTML

#### Process Content Errors
- **Behavior**: Log error, use extracted content, continue
- **Fallback**: Use extracted content

#### Validate Content Errors
- **Behavior**: Log error, **skip article** (don't save it)
- **Reason**: Ensures quality - invalid articles are not saved

### Error Logging Format

All errors are logged with consistent structure:

```typescript
{
  step: "enrichArticles",
  subStep: "fetchArticleContent",
  aggregator: "full_website",
  feedId: 123,
  url: "https://example.com/article",
  error: Error,
  fallback: "summary",
  elapsed: 1234
}
```

## Configuration

### Rate Limiting

**Property:** `readonly rateLimitDelay: number = 1000` (milliseconds)

**Default:** 1000ms (1 second)

**Override:** Set in aggregator class:
```typescript
readonly rateLimitDelay: number = 2000; // 2 seconds
```

**Method:** `protected async applyRateLimiting(): Promise<void>`

Override for custom rate limiting logic (e.g., respect API rate limit headers).

### Caching

**Properties:**
- `readonly cacheTTL: number = 3600` (seconds, default: 1 hour)
- `readonly cacheMaxSize: number = 1000` (entries, default: 1000)

**Override:** Set in aggregator class:
```typescript
readonly cacheTTL: number = 7200; // 2 hours
readonly cacheMaxSize: number = 500; // 500 entries
```

**Methods:**
- `protected async getCachedContent(article: RawArticle): Promise<string | null>`
- `protected async setCachedContent(article: RawArticle, content: string): Promise<void>`

Override for custom caching strategy.

### Content Validation

**Method:** `protected validateContent(content: string, article: RawArticle): boolean`

**Default:** Checks:
- Content is not empty
- Minimum length: 50 characters

**Override:** Add custom validation logic.

## Debugging Tools

### Test Aggregator Script

The `npm run test:aggregator` script tests all aggregators against a specific article URL.

**Usage:**
```bash
npm run test:aggregator <url>
```

**Example:**
```bash
npm run test:aggregator https://example.com/article
```

**What it does:**
1. Iterates through all registered aggregators
2. For each aggregator:
   - Creates a mock feed with the URL
   - Initializes the aggregator
   - Tests `fetchArticleContent()` if applicable
   - Tests `processArticleContent()` (which includes extraction and processing)
   - Shows results: success/failure, content length, processing time, errors

**Output:**
- Success/failure status for each aggregator
- Content length (extracted, processed, final)
- Processing time
- Error messages if any
- Summary of results

**Use cases:**
- Testing aggregator changes
- Debugging content extraction issues
- Comparing aggregator behavior on the same URL
- Quick validation during development

### Logging

All steps log with consistent format:

```typescript
{
  step: "fetchSourceData",
  subStep: "fetchRssFeed",
  aggregator: "full_website",
  feedId: 123,
  url: feedUrl,
  elapsed: 1234,
  itemCount: 10
}
```

**Log levels:**
- `info`: Major steps (fetchSourceData, parseToRawArticles, filterArticles, enrichArticles, finalizeArticles)
- `debug`: Sub-steps (applyRateLimiting, getCachedContent, extractContent, etc.)
- `warn`: Non-critical errors (fallbacks, skipped articles)
- `error`: Critical errors

## Creating Custom Aggregators

### Step 1: Create Aggregator Class

Create a new file in `src/server/aggregators/`:

```typescript
import { BaseAggregator } from "./base/aggregator";
import type { RawArticle } from "./base/types";

export class MyAggregator extends BaseAggregator {
  override readonly id = "my_aggregator";
  override readonly type = "custom" as const;
  override readonly name = "My Aggregator";
  override readonly url = "https://example.com/feed.xml";
  override readonly description = "My custom aggregator";
  
  // Optional: Override configuration
  readonly rateLimitDelay: number = 2000;
  readonly cacheTTL: number = 7200;
}
```

### Step 2: Implement Required Methods

You must implement:

1. **`fetchSourceData(limit?: number): Promise<unknown>`**
   - Fetch your source data (RSS, API, etc.)

2. **`parseToRawArticles(sourceData: unknown): Promise<RawArticle[]>`**
   - Transform source data to `RawArticle[]`

### Step 3: Override Steps as Needed

Override any step to customize behavior:

```typescript
// Custom validation
protected override async validate(): Promise<void> {
  await super.validate();
  // Your validation logic
}

// Custom rate limiting
protected override async applyRateLimiting(): Promise<void> {
  // Your rate limiting logic
}

// Custom extraction
protected override async extractContent(
  html: string,
  article: RawArticle,
): Promise<string> {
  // Your extraction logic
  return await super.removeElementsBySelectors(extracted, article);
}

// Custom processing
protected override async processContent(
  html: string,
  article: RawArticle,
): Promise<string> {
  // Your processing logic
  return await super.processContent(html, article);
}
```

### Step 4: Register Aggregator

Add to `src/server/aggregators/registry.ts`:

```typescript
import { MyAggregator } from "./my_aggregator";

const aggregatorClasses = new Map<string, new () => BaseAggregator>([
  // ... existing aggregators
  ["my_aggregator", MyAggregator],
]);
```

### Example: Simple RSS Aggregator

```typescript
import { BaseAggregator } from "./base/aggregator";
import type { RawArticle } from "./base/types";
import { fetchFeed } from "./base/fetch";
import Parser from "rss-parser";

export class SimpleRssAggregator extends BaseAggregator {
  override readonly id = "simple_rss";
  override readonly type = "custom" as const;
  override readonly name = "Simple RSS";
  override readonly url = "";
  override readonly description = "Simple RSS feed aggregator";

  protected override async fetchSourceData(
    limit?: number,
  ): Promise<Parser.Output<any>> {
    if (!this.feed) throw new Error("Feed not initialized");
    return await fetchFeed(this.feed.identifier);
  }

  protected override async parseToRawArticles(
    sourceData: unknown,
  ): Promise<RawArticle[]> {
    const feed = sourceData as Parser.Output<any>;
    return (feed.items || []).map((item) => ({
      title: item.title || "",
      url: item.link || "",
      published: item.pubDate ? new Date(item.pubDate) : new Date(),
      summary: item.contentSnippet || "",
    }));
  }

  // RSS-only: never fetch content
  protected override shouldFetchContent(article: RawArticle): boolean {
    return false;
  }
}
```

### Example: Custom Extraction Aggregator

```typescript
export class CustomExtractionAggregator extends BaseAggregator {
  // ... metadata ...

  protected override async fetchSourceData(
    limit?: number,
  ): Promise<Parser.Output<any>> {
    // ... fetch RSS ...
  }

  protected override async parseToRawArticles(
    sourceData: unknown,
  ): Promise<RawArticle[]> {
    // ... parse to articles ...
  }

  // Custom extraction with specific selector
  protected override async extractContent(
    html: string,
    article: RawArticle,
  ): Promise<string> {
    const { extractContent } = await import("./base/extract");
    const extracted = extractContent(html, {
      contentSelector: ".article-content", // Custom selector
      selectorsToRemove: this.selectorsToRemove,
    });
    return await super.removeElementsBySelectors(extracted, article);
  }
}
```

## Best Practices

1. **Always call `super`**: When overriding methods, call `super.method()` unless you're completely replacing the behavior
2. **Log consistently**: Use the structured logging format with `step`, `subStep`, `aggregator`, `feedId`
3. **Handle errors gracefully**: Use fallbacks (summary, original content) when possible
4. **Skip invalid articles**: Return `false` from `validateContent()` to skip low-quality articles
5. **Use caching**: Leverage the built-in caching for performance
6. **Respect rate limits**: Override `applyRateLimiting()` for API-based aggregators
7. **Test with script**: Use `npm run test:aggregator` to test your aggregator

## Migration from Old Flow

If you have an existing aggregator with a custom `aggregate()` method:

1. **Remove `aggregate()` override**: The base class now provides the template method
2. **Implement `fetchSourceData()`**: Move your data fetching logic here
3. **Implement `parseToRawArticles()`**: Move your parsing logic here
4. **Override steps as needed**: Move custom logic to appropriate step methods

The template method will automatically call your implementations in the correct order.
