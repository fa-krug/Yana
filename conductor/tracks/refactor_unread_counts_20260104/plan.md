# Plan: Refactor Unread Counts and Indexes

## Phase 1: Database Indexing [checkpoint: f605409]
- [x] Task: Add composite index `Article(feed, read, date)` to the Article model. (8bb7186)
- [x] Task: Add index `Feed(aggregator)` to the Feed model. (8bb7186)
- [x] Task: Conductor - User Manual Verification 'Phase 1: Database Indexing' (Protocol in workflow.md)

## Phase 2: Unread Count Optimization [checkpoint: af2efef]
- [x] Task: Refactor `StreamService._compute_unread_count` to use single-query conditional aggregation. (7e50919)
- [x] Task: Conductor - User Manual Verification 'Phase 2: Unread Count Optimization' (Protocol in workflow.md)

## Phase 3: Stream Filtering Optimization [checkpoint: 154f1f8]
- [x] Task: Review and optimize `get_stream_item_ids` and `get_stream_contents` query logic. (7d1fdce)
- [x] Task: Conductor - User Manual Verification 'Phase 3: Stream Filtering Optimization' (Protocol in workflow.md)

## Phase 4: Performance Verification
- [ ] Task: Create a verification script to confirm query count reduction for the `unread_count` endpoint.
- [ ] Task: Run all GReader API tests to ensure no regressions.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Performance Verification' (Protocol in workflow.md)
