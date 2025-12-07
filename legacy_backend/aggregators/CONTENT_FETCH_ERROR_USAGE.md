# ContentFetchError Usage Guide

## Overview

`ContentFetchError` is a custom exception raised when article content cannot be fetched from the source (website, API, etc.). When this exception is raised during article processing, the article is **skipped entirely** (not saved) and aggregation continues with the next article.

## Base Implementation

### Where ContentFetchError is Raised

1. **`fetch_article_content()`** (`base/fetch.py`)
   - Raises `ContentFetchError` on timeout or any fetch failure
   - Used by all aggregators that fetch web content

2. **`process_article()`** (`base/aggregator.py`)
   - No longer catches `ContentFetchError` - re-raises it to `aggregate()`

3. **`aggregate()`** (`base/aggregator.py`)
   - Catches `ContentFetchError` specifically
   - Skips the article and logs a warning
   - Continues processing remaining articles

## Aggregators with Custom Fetch Logic

### 1. **oglaf.py** ✅ Updated
- **Custom**: `fetch_article_html()` - Handles age confirmation page
- **Usage**: Raises `ContentFetchError` on fetch failures
- **Behavior**: Article skipped if content cannot be fetched

### 2. **mein_mmo.py** ✅ Updated
- **Custom**: `_fetch_all_pages()` - Fetches multi-page articles
- **Usage**: 
  - First page failure → Raises `ContentFetchError` (article skipped)
  - Subsequent page failures → Catches `ContentFetchError`, logs warning, continues (partial content acceptable)
- **Behavior**: Article skipped if first page fails; partial content if later pages fail

### 3. **heise.py** ✅ Updated
- **Custom**: 
  - `fetch_article_html()` - Uses multi-page URL option
  - `process_article()` - Fetches article again for comment extraction
  - `_extract_comments()` - Fetches forum page for comments
- **Usage**:
  - Main article fetch → Raises `ContentFetchError` (article skipped)
  - Comment extraction fetch → Catches `ContentFetchError`, continues without comments (comments are optional)
  - Forum page fetch → Catches `ContentFetchError`, continues without comments
- **Behavior**: Article skipped if main content fails; comments optional

### 4. **youtube.py** 
- **Custom**: `fetch_article_html()` - Generates HTML from API data
- **Usage**: No web fetching, generates content from API data
- **Behavior**: N/A (doesn't fetch web content)

### 5. **reddit.py**
- **Custom**: `aggregate()` - Uses Reddit API instead of RSS
- **Usage**: No web fetching, uses API
- **Behavior**: N/A (doesn't fetch web content)

### 6. **podcast.py**
- **Custom**: `fetch_article_html()` - Generates HTML from RSS data
- **Usage**: No web fetching, generates content from RSS
- **Behavior**: N/A (doesn't fetch web content)

### 7. **feed_content.py**
- **Custom**: `fetch_article_html()` - Returns RSS content directly
- **Usage**: No web fetching
- **Behavior**: N/A (doesn't fetch web content)

## Best Practices

### When to Raise ContentFetchError

Raise `ContentFetchError` when:
- Web content cannot be fetched (timeout, network error, HTTP error)
- Required content is missing or inaccessible
- The article should be skipped entirely

### When to Catch ContentFetchError

Catch `ContentFetchError` when:
- Fetching **optional** content (e.g., comments, additional pages)
- Partial failures are acceptable (e.g., multi-page articles where some pages fail)
- You want to continue processing with degraded content

### Example Pattern

```python
from .base.exceptions import ContentFetchError

def fetch_optional_content(self, url: str) -> str:
    """Fetch optional content - continue without it if fetch fails."""
    try:
        return fetch_article_content(url)
    except ContentFetchError as e:
        self.logger.warning(f"Optional content unavailable: {e}")
        return ""  # Return empty/default content
```

## Error Handling Flow

```
aggregate()
  └─> process_article()
       └─> fetch_article_html()
            └─> fetch_article_content()  [Raises ContentFetchError]
                 
ContentFetchError caught in aggregate()
  └─> Article skipped
  └─> Log warning
  └─> Continue with next article
```

## Benefits

1. **Consistent behavior**: All aggregators skip articles on fetch failure
2. **Clear error distinction**: Content fetch errors vs. other processing errors
3. **Graceful degradation**: Optional content failures don't break the article
4. **Better logging**: Specific warnings for skipped articles
