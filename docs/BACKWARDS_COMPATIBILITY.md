# Backwards Compatibility Guide

This document explains how the new Template Method Pattern aggregator architecture maintains backwards compatibility with existing code.

## Overview

The refactoring to the Template Method Pattern was designed to be **100% backwards compatible**. All existing code that uses aggregators continues to work without modification.

## Public API Compatibility

### 1. `aggregate()` Method

**Status:** ✅ Fully Compatible

The `aggregate()` method signature and behavior remain unchanged:

```typescript
async aggregate(articleLimit?: number): Promise<RawArticle[]>
```

**What Changed:**
- **Internal implementation**: Now uses the Template Method Pattern with fixed flow steps
- **External interface**: Identical signature and return type
- **Behavior**: Same results, same error handling, same return format

**Example Usage (unchanged):**
```typescript
const aggregator = getAggregatorById("full_website");
aggregator.initialize(feed, false, {});
const articles = await aggregator.aggregate(10); // Still works!
```

### 2. `processArticleContent()` Method

**Status:** ✅ Fully Compatible

This method is used by the aggregation service for article reloads. It remains fully functional:

```typescript
async processArticleContent(
  article: RawArticle,
  html: string,
  selectorsToRemove?: string[]
): Promise<string>
```

**What Changed:**
- **Internal implementation**: Now delegates to the new template method steps (`extractContent()` and `processContent()`)
- **External interface**: Identical signature
- **Behavior**: Same processing results

**Example Usage (unchanged):**
```typescript
// Used in aggregation.service.ts for article reload
const processed = await aggregator.processArticleContent(rawArticle, html);
```

**Implementation Details:**
- The method temporarily overrides `selectorsToRemove` if provided
- Calls `extractContent()` and `processContent()` internally
- Restores original selectors after processing
- Maintains exact same output format

### 3. `fetchArticleContent()` Method

**Status:** ✅ Fully Compatible (with deprecation notice)

This public method is still available but marked as deprecated:

```typescript
async fetchArticleContent(
  url: string,
  options: {
    timeout?: number;
    waitForSelector?: string;
    maxRetries?: number;
  } = {}
): Promise<string>
```

**What Changed:**
- **Internal implementation**: Now delegates to `fetchArticleContentInternal()` (the protected template method)
- **External interface**: Identical signature
- **Behavior**: Same fetching behavior (fail-fast, no retries)
- **Deprecation**: Marked as deprecated in favor of the template method flow

**Example Usage (unchanged):**
```typescript
// Still works, but deprecated
const html = await aggregator.fetchArticleContent(url, {
  timeout: 30000,
  waitForSelector: ".content"
});
```

**Why Deprecated:**
- The new template method flow uses `fetchArticleContentInternal()` which is part of the fixed flow
- Direct fetching bypasses the flow's caching, rate limiting, and error handling
- However, it's kept for backwards compatibility with existing code

## Service Integration Compatibility

### Aggregation Service

**Status:** ✅ Fully Compatible

The `aggregation.service.ts` continues to work without any changes:

```typescript
// Initialize aggregator (unchanged)
aggregator.initialize(feed, forceRefresh, feed.aggregatorOptions);

// Run aggregation (unchanged)
const rawArticles = await aggregator.aggregate(articleLimit);

// Process article reload (unchanged)
const processed = await aggregator.processArticleContent(rawArticle, html);
```

**What Works:**
- ✅ Feed initialization
- ✅ Aggregation execution
- ✅ Article reload functionality
- ✅ Feed icon collection
- ✅ Error handling and fallbacks

### Feed Service

**Status:** ✅ Fully Compatible

The feed service continues to work with aggregators:

```typescript
// Get aggregator metadata (unchanged)
const metadata = getAggregatorMetadata(aggregatorId);

// Get aggregator instance (unchanged)
const aggregator = getAggregatorById(aggregatorId);
```

## Return Format Compatibility

### RawArticle Interface

**Status:** ✅ Fully Compatible

The `RawArticle` interface remains unchanged:

```typescript
interface RawArticle {
  title: string;
  url: string;
  published: Date;
  summary?: string;
  author?: string;
  content?: string;
  thumbnailUrl?: string;
  // ... other optional fields
}
```

**What Works:**
- ✅ Same structure
- ✅ Same field names
- ✅ Same optional fields
- ✅ Same data types

## Error Handling Compatibility

### Fallback Behavior

**Status:** ✅ Fully Compatible

Error handling maintains the same fallback behavior:

1. **Fetch Failure**: Falls back to `article.summary` (if available)
2. **Extract Failure**: Falls back to original HTML
3. **Process Failure**: Falls back to extracted content
4. **Validation Failure**: Article is skipped (not saved)

**Example (unchanged behavior):**
```typescript
// If fetchArticleContent fails:
article.content = article.summary || ""; // Same fallback

// If extractContent fails:
extracted = html; // Same fallback

// If processContent fails:
processed = extracted; // Same fallback
```

### Error Logging

**Status:** ✅ Enhanced (backwards compatible)

Error logging is now more detailed but maintains the same structure:

**Before:**
```typescript
logger.error({ error, url }, "Failed to fetch content");
```

**After (enhanced):**
```typescript
logger.error({
  step: "enrichArticles",
  subStep: "fetchArticleContent",
  aggregator: this.id,
  feedId: this.feed?.id,
  url: article.url,
  error: error instanceof Error ? error : new Error(String(error)),
  fallback: "summary",
}, "Failed to fetch content, using summary");
```

**Compatibility:**
- ✅ Same error messages
- ✅ Same error types
- ✅ Additional context (non-breaking)

## Configuration Compatibility

### Aggregator Options

**Status:** ✅ Fully Compatible

Aggregator options continue to work the same way:

```typescript
// Access options (unchanged)
const maxComments = this.getOption("max_comments", 0);
const traverseMultipage = this.getOption("traverse_multipage", false);
```

**What Works:**
- ✅ Same option access methods
- ✅ Same default values
- ✅ Same option types
- ✅ Same validation

### Feed Configuration

**Status:** ✅ Fully Compatible

Feed configuration properties remain unchanged:

```typescript
// Feed properties (unchanged)
feed.generateTitleImage // Still works
feed.addSourceFooter    // Still works
feed.dailyPostLimit     // Still works
feed.aggregatorOptions  // Still works
```

## Override Compatibility

### Method Overrides

**Status:** ✅ Enhanced (backwards compatible)

Aggregators can still override methods, but now with better structure:

**Before (old pattern):**
```typescript
async aggregate(articleLimit?: number): Promise<RawArticle[]> {
  // Custom logic
  const articles = await super.aggregate(articleLimit);
  // More custom logic
  return articles;
}
```

**After (new pattern - recommended):**
```typescript
// Override specific steps instead
protected override async extractContent(
  html: string,
  article: RawArticle,
): Promise<string> {
  // Custom extraction logic
  return await super.extractContent(html, article);
}
```

**Compatibility:**
- ✅ Old override pattern still works (if you override `aggregate()`)
- ✅ New override pattern is recommended (override specific steps)
- ✅ Both patterns produce same results

## Migration Path

### For Existing Aggregators

If you have an aggregator that overrides `aggregate()`:

1. **Option 1 (Recommended)**: Refactor to override specific steps
   ```typescript
   // Instead of overriding aggregate(), override specific steps:
   protected override async extractContent(...) { }
   protected override async processContent(...) { }
   ```

2. **Option 2 (Temporary)**: Keep overriding `aggregate()` - it still works
   ```typescript
   // This still works, but not recommended
   override async aggregate(articleLimit?: number) {
     const articles = await super.aggregate(articleLimit);
     // Custom logic
     return articles;
   }
   ```

### For Service Code

**No changes required!** All service code continues to work:

```typescript
// aggregation.service.ts - NO CHANGES NEEDED
const articles = await aggregator.aggregate(articleLimit);
const processed = await aggregator.processArticleContent(article, html);
```

### For Tests

**Minimal changes required:**

1. Tests that mock `aggregate()` - ✅ Still work
2. Tests that test specific steps - Update to test new step methods
3. Tests that verify error handling - ✅ Still work (same behavior)

## Breaking Changes

**None!** There are no breaking changes in this refactoring.

### What Didn't Change

- ✅ Public API methods (`aggregate()`, `processArticleContent()`, `fetchArticleContent()`)
- ✅ Return types (`RawArticle[]`, `string`)
- ✅ Error handling behavior (fallbacks, skipping)
- ✅ Service integration (aggregation.service.ts, feed.service.ts)
- ✅ Configuration access (`getOption()`, feed properties)
- ✅ Initialization (`initialize()`)

### What Changed (Internal Only)

- 🔄 Internal implementation (Template Method Pattern)
- 🔄 Protected method structure (new step methods)
- 🔄 Logging format (enhanced with more context)
- 🔄 Error messages (more detailed, but same meaning)

## Verification

To verify backwards compatibility:

1. **Run existing tests**: All tests should pass without modification
2. **Test aggregation**: Run aggregation for existing feeds - should work identically
3. **Test article reload**: Reload existing articles - should work identically
4. **Check logs**: Logs should have more detail but same information

## Summary

The refactoring maintains **100% backwards compatibility**:

- ✅ All public methods work the same
- ✅ All return types are identical
- ✅ All error handling behaves the same
- ✅ All service integration works without changes
- ✅ All configuration access works the same

The only changes are:
- 🔄 Internal implementation (better structure)
- 🔄 Enhanced logging (more context)
- 🔄 New override points (more granular control)

**No code changes required for existing aggregators or services!**
