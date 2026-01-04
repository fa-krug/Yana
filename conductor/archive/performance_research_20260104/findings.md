# Performance Research Findings

## 1. Executive Summary
The system is currently performing well at small scale (startup 0.3s, 50 feeds unread count 0.027s). However, significant N+1 query patterns were identified that will cause performance degradation as the number of users, feeds, and articles grows. The aggregation process is network-bound, but database hygiene improvements are necessary.

## 2. Identified Bottlenecks

### A. Database Query Efficiency (High Priority)
*   **Unread Counts:** `StreamService._compute_unread_count` executes 3 queries per feed. For a user with 100 feeds, this means 300 queries per API call. This is an O(N) operation that should be O(1) or O(K).
*   **Aggregation:** `AggregatorService.trigger_by_feed_id` performs `Article.objects.get_or_create` in a loop. While the total impact is currently masked by network latency, this is inefficient for bulk processing.

### B. Database Indexing (Medium Priority)
*   **Feed Filtering:** Missing index on `Feed.aggregator` field.
*   **Stream Filtering:** Missing composite index on `Article(feed, read, date)` to optimize the most common GReader API access pattern (unread articles by date).

### C. Architecture (Low Priority)
*   **Admin UI:** Currently highly responsive. N+1 service calls in Admin Actions are noted but acceptable given they are background-delegated or infrequent network-bound operations.
*   **Synchronous Processing:** Aggregation is synchronous per feed but runs in background workers. No immediate change required.

## 3. Recommendations

1.  **Optimize Unread Counts:** Refactor `get_unread_count` to use Django conditional aggregation (`Count(..., filter=Q(...))`) to fetch all counts in a single query.
2.  **Optimize Aggregation:** Refactor `AggregatorService` to use `bulk_create` (with `ignore_conflicts=True` or manual diffing) instead of looping `get_or_create`.
3.  **Apply Indexes:** Add the recommended indexes to `Article` and `Feed` models.

## 4. Next Steps
Two new tracks will be created to address these issues:
1.  `refactor_unread_counts_20260104`: Optimize GReader stream services and add indexes.
2.  `refactor_aggregator_db_20260104`: Optimize aggregation persistence logic.
