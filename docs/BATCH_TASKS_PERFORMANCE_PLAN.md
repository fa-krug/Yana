# Performance Improvement Plan: Batch Tasks in Article List View

## Goal
Improve the performance of batch operations in the article list view:
- **Mark Read**: Mark all filtered articles as read
- **Mark Unread**: Mark all filtered articles as unread  
- **Delete**: Delete all filtered articles
- **Refresh**: Refresh/reload all filtered articles

Handle large datasets efficiently without timeouts or poor UX.

## Current Performance Issues

### Frontend Issues
1. **Inefficient ID Collection**: `getAllFilteredArticleIds()` paginates through ALL pages sequentially to collect article IDs, making multiple API calls
2. **Sequential Processing**: Delete and refresh operations process articles one-by-one using `mergeMap`/`concatMap`
3. **Full Page Refresh**: After operations complete, the entire article list is refetched
4. **Limited Progress Feedback**: Spinning icon exists but no detailed progress for long-running operations
5. **No Chunking**: All article IDs are sent in a single request, which can timeout for very large batches

**Note**: The existing spinning icon animation (`bulkOperationLoading` signal) works well and should be preserved

### Backend Issues
1. **N+1 Query Problem**: `markArticlesRead()` loops through each article ID, making separate database queries
2. **Individual Access Checks**: Each article's access is verified separately with `getArticle()`
3. **No Bulk Database Operations**: Uses individual INSERT/UPDATE queries instead of batch operations
4. **No Transaction Wrapping**: Operations aren't wrapped in transactions for atomicity
5. **No Database-Level Filtering**: Could use SQL WHERE clauses instead of fetching all IDs first
6. **No Bulk Delete**: Delete operations process articles one-by-one
7. **No Bulk Refresh**: Refresh operations queue tasks one-by-one

## Performance Improvement Strategy

### Phase 1: Backend Optimizations (High Impact)

#### 1.1 Optimize `markArticlesRead()`
**Current**: N queries (one per article)
**Target**: 2-3 queries total (bulk operations)

**Changes**:
- Batch access verification: Query all articles at once with JOIN to feeds table
- Bulk state retrieval: Single query to get all existing states
- Bulk INSERT/UPDATE: Use batch operations with `onConflictDoUpdate`
- Wrap in transaction for atomicity

**Files to Modify**:
- `src/server/services/article.service.ts` - `markArticlesRead()`

**Expected Impact**: 10-100x faster for batches of 100+ articles

**Note**: This handles both "mark read" and "mark unread" operations (same function, different boolean value)

#### 1.2 Add Bulk Delete Endpoint
**Current**: Frontend calls delete one-by-one
**Target**: Single bulk delete endpoint

**Changes**:
- Create `deleteArticles()` function that accepts array of IDs
- Batch access verification
- Single DELETE query with `IN` clause
- Wrap in transaction

**Files to Modify**:
- `src/server/services/article.service.ts` - Add `deleteArticles()`
- `src/server/trpc/routers/article.router.ts` - Add `deleteMany` procedure

**Expected Impact**: 50-100x faster for batches

#### 1.3 Add Bulk Refresh Endpoint
**Current**: Frontend calls refresh one-by-one
**Target**: Single bulk refresh endpoint that queues tasks

**Changes**:
- Create `reloadArticles()` function that accepts array of IDs
- Batch access verification
- Queue all reload tasks at once
- Return task IDs for tracking

**Files to Modify**:
- `src/server/services/article.service.ts` - Add `reloadArticles()`
- `src/server/trpc/routers/article.router.ts` - Add `reloadMany` procedure

**Expected Impact**: 10-50x faster for batches

#### 1.4 Add Filter-Based Bulk Operations
**Current**: Frontend fetches all IDs, then sends to backend
**Target**: Backend accepts filters directly, performs operation in SQL

**Changes**:
- Create `markFilteredRead()`, `deleteFiltered()`, `refreshFiltered()` functions
- Accept `ArticleFilters` instead of article IDs
- Use SQL WHERE clauses to update/delete directly
- Return count of affected rows

**Files to Modify**:
- `src/server/services/article.service.ts` - Add filter-based functions
- `src/server/trpc/routers/article.router.ts` - Add filter-based procedures

**Expected Impact**: Eliminates need to fetch IDs entirely, 100-1000x faster for large datasets

### Phase 2: Frontend Optimizations (Medium Impact)

#### 2.1 Use Filter-Based Backend Operations
**Current**: Fetch all IDs, then send to backend
**Target**: Send filters directly to backend

**Changes**:
- Replace `getAllFilteredArticleIds()` + individual operations with direct filter-based calls
- Remove pagination logic for ID collection
- **Preserve `bulkOperationLoading` signal** - Keep existing loading state management
- **Preserve spinning animation** - Keep `[class.spinning]` bindings and CSS animation

**Files to Modify**:
- `src/app/core/services/article.service.ts` - Update `markAllFilteredRead()`, `deleteAllFiltered()`, `refreshAllFiltered()`
- `src/app/features/articles/article-list.component.ts` - Ensure `bulkOperationLoading` signal is still used correctly

**Expected Impact**: Eliminates multiple API calls, faster response, maintains visual feedback

#### 2.2 Add Progress Tracking for Long Operations
**Current**: Spinning icon on button (preserved), no detailed progress
**Target**: Keep spinning icon, add optional progress bar/percentage for very long operations

**Changes**:
- **Preserve existing spinning animation** on batch operation buttons
- For refresh operations, poll task status and show additional progress info
- For large batches, show estimated time remaining (optional enhancement)
- Use WebSocket or SSE for real-time updates (optional, Phase 3)

**Files to Modify**:
- `src/app/features/articles/article-list.component.ts` - Keep spinning, add optional progress UI
- `src/app/core/services/article.service.ts` - Add progress tracking

**Expected Impact**: Better UX, perceived performance

**Note**: The existing `bulkOperationLoading` signal and spinning icon animation must be preserved

#### 2.3 Optimistic UI Updates
**Current**: Wait for backend, then refresh (spinning icon shows during wait)
**Target**: Update UI immediately, rollback on error (keep spinning during operation)

**Changes**:
- Update local state immediately when batch operation starts
- **Keep spinning icon active** during operation (existing `bulkOperationLoading` signal)
- Show loading state per article or overall (optional enhancement)
- Rollback changes if operation fails

**Files to Modify**:
- `src/app/features/articles/article-list.component.ts` - Add optimistic updates, preserve spinning
- `src/app/core/services/article.service.ts` - Add rollback logic

**Expected Impact**: Perceived instant response while maintaining visual feedback

**Note**: The spinning icon animation (`.spinning` class) and `bulkOperationLoading` signal must remain functional

#### 2.4 Chunk Large Operations
**Current**: Send all IDs in one request
**Target**: Chunk into batches of 100-500 items

**Changes**:
- Split large ID arrays into chunks
- Process chunks in parallel (with concurrency limit)
- Aggregate results

**Files to Modify**:
- `src/app/core/services/article.service.ts` - Add chunking logic

**Expected Impact**: Prevents timeouts, better error handling

### Phase 3: Advanced Optimizations (Lower Priority)

#### 3.1 Database Indexing
**Changes**:
- Ensure indexes on `userArticleStates(userId, articleId)`
- Ensure indexes on `articles(feedId, date)` for filtering
- Composite indexes for common filter combinations

**Files to Modify**:
- `src/server/db/migrations/` - Add migration for indexes

**Expected Impact**: Faster queries, especially for large datasets

#### 3.2 Caching Strategy
**Changes**:
- Cache unread counts (already exists, verify it's working)
- Cache article lists for common filters
- Invalidate cache on batch operations

**Files to Modify**:
- `src/server/utils/cache.ts` - Review and optimize

**Expected Impact**: Faster subsequent operations

#### 3.3 Background Processing
**Changes**:
- For very large batches (>1000 items), queue as background job
- Return job ID immediately
- Poll for completion
- Use WebSocket/SSE for real-time updates

**Files to Modify**:
- `src/server/services/taskQueue.service.ts` - Add batch job support
- `src/app/core/services/article.service.ts` - Add job polling

**Expected Impact**: Non-blocking for very large operations

## Implementation Priority

### Priority 1 (Immediate - Highest Impact)
1. **Backend: Optimize `markArticlesRead()`** - Bulk operations for mark read/unread
2. **Backend: Add filter-based bulk operations** - Eliminate ID fetching for all four operations
3. **Frontend: Use filter-based operations** - Remove pagination overhead
4. **Frontend: Preserve spinning animation** - Keep existing `bulkOperationLoading` signal and `.spinning` CSS class

### Priority 2 (Short-term - High Impact)
5. **Backend: Add bulk delete endpoint**
6. **Backend: Add bulk refresh endpoint**
7. **Frontend: Optimistic UI updates** - While preserving spinning feedback

### Priority 3 (Medium-term - Medium Impact)
7. **Frontend: Progress tracking**
8. **Frontend: Chunking for large operations**
9. **Database: Index optimization**

### Priority 4 (Long-term - Nice to Have)
10. **Background processing for very large batches**
11. **WebSocket/SSE for real-time updates**
12. **Advanced caching strategies**

## Success Metrics

### Performance Targets
- **Mark Read/Unread**: < 1 second for 100 articles, < 5 seconds for 1000 articles
- **Delete**: < 2 seconds for 100 articles, < 10 seconds for 1000 articles
- **Refresh**: < 5 seconds to queue 100 articles, < 30 seconds to queue 1000 articles

### Current Performance (Estimated)
- **Mark Read/Unread**: ~5-10 seconds for 100 articles, ~50-100 seconds for 1000 articles
- **Delete**: ~10-20 seconds for 100 articles, ~100-200 seconds for 1000 articles
- **Refresh**: ~20-40 seconds for 100 articles, ~200-400 seconds for 1000 articles

### Expected Improvements
- **10-100x faster** for mark read/unread operations
- **50-100x faster** for delete operations
- **10-50x faster** for refresh operations
- **Eliminate** need for ID pagination (infinite speedup for filter-based ops)

## UI/UX Preservation Requirements

### Must Preserve
1. **Spinning Animation**: The `.spinning` CSS class and animation must continue to work
2. **Loading Signal**: The `bulkOperationLoading` signal must continue to track operation state
3. **Button States**: Buttons must remain disabled during operations
4. **Visual Feedback**: Spinning icons on each button (read, unread, delete, refresh) must continue to animate
5. **Aria Attributes**: `aria-busy` attributes must continue to reflect operation state

### Current Implementation (Reference)
- `bulkOperationLoading` signal: `"read" | "unread" | "delete" | "refresh" | null`
- Template: `[class.spinning]="bulkOperationLoading() === 'read'"`
- CSS: `.spinning { animation: spin 1s linear infinite; }`
- Button disabled: `[disabled]="bulkOperationLoading()"`

**All of these must be preserved in the optimized implementation.**

## Testing Strategy

1. **Unit Tests**: Test bulk operations with various batch sizes (10, 100, 1000, 10000)
2. **Integration Tests**: Test filter-based operations with complex filters
3. **Performance Tests**: Benchmark before/after improvements
4. **Load Tests**: Test with realistic data volumes
5. **Error Handling**: Test with invalid IDs, permission errors, network failures
6. **UI Tests**: Verify spinning animations work correctly during all operations

## Risk Assessment

### Low Risk
- Backend bulk operations (well-established patterns)
- Filter-based operations (SQL-level operations are safe)

### Medium Risk
- Optimistic UI updates (need careful rollback logic)
- Chunking (need to handle partial failures)

### High Risk
- Background processing (adds complexity, need job queue infrastructure)

## Dependencies

- No new external dependencies required for Priority 1-2
- Background processing (Priority 4) may require job queue library (e.g., Bull, BullMQ)

## Estimated Effort

- **Priority 1**: 2-3 days
- **Priority 2**: 2-3 days
- **Priority 3**: 1-2 days
- **Priority 4**: 3-5 days

**Total**: ~8-13 days for complete implementation
