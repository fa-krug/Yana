# Specification: Refactor Unread Counts and Indexes

## 1. Overview
This refactor track focuses on eliminating the N+1 query bottlenecks in the GReader API and applying optimized database indexes identified during the performance research phase. The primary goals are to make the `unread_count` and `stream_items_ids` endpoints highly efficient regardless of the number of feeds or articles.

## 2. Functional Requirements
*   **Unread Count Optimization:**
    *   Refactor `core.services.greader.stream_service._compute_unread_count` to use Django's conditional aggregation.
    *   Replace the loop that executes 3 queries per feed with a single, efficient query that fetches all counts and newest timestamps.
*   **Stream Filtering Optimization:**
    *   Review and optimize the `stream_items_ids` and `stream_contents` query logic to ensure they leverage the new composite indexes.
*   **Database Indexing:**
    *   Add a composite index to the `Article` model: `["feed", "read", "date"]`.
    *   Add an index to the `Feed` model: `["aggregator"]`.

## 3. Non-Functional Requirements
*   **Performance:** `unread_count` should execute in O(1) or O(K) database queries (where K is constant), not O(N) relative to the number of feeds.
*   **Compatibility:** Maintain strict compatibility with the Google Reader API format.
*   **Reliability:** Ensure 100% test pass rate for all GReader API tests.

## 4. Acceptance Criteria
*   The `_compute_unread_count` function executes a maximum of 2 database queries regardless of the number of feeds.
*   The new composite index `Article(feed, read, date)` is successfully created and used by the query planner.
*   All existing tests in `core/tests/test_greader_stream.py` pass.
*   Verification script confirms query count reduction.

## 5. Out of Scope
*   Optimizing the feed fetching/parsing logic (handled in the Aggregator Refactor track).
*   Any changes to the Admin UI beyond standard index benefits.
