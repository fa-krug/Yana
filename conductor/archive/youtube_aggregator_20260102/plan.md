# Plan: YouTube Aggregator Reimplementation

This plan outlines the steps to reimplement the YouTube aggregator in Python, including the removal of legacy fields and the addition of admin autocomplete functionality.

## Phase 1: Database and Model Cleanup
- [x] Task: Verify `youtube_enabled` in `UserSettings` model.
    - [x] Sub-task: Ensure the `youtube_enabled` field exists in `core.models.UserSettings`.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Database and Model Cleanup' (Protocol in workflow.md)

## Phase 2: YouTube API Service Layer [checkpoint: 7406a88]
- [x] Task: Implement YouTube API client. 97445e3
    - [x] Sub-task: Create `core/aggregators/utils/youtube_client.py` to handle raw API requests (channels, playlistItems, videos, commentThreads).
    - [x] Sub-task: Implement quota-efficient batching for video details.
- [x] Task: Implement Channel Resolution logic. 97445e3
    - [x] Sub-task: Create logic to resolve handles (@name), IDs (UC...), and URLs to a canonical Channel ID.
- [x] Task: Conductor - User Manual Verification 'Phase 2: YouTube API Service Layer' (Protocol in workflow.md) 7406a88

## Phase 3: Aggregator Implementation
- [x] Task: Create `YoutubeAggregator` class in `core/aggregators/youtube/aggregator.py`. e74c3dc
    - [x] Sub-task: Implement `fetch_source_data` using the API client.
    - [x] Sub-task: Implement `parse_to_raw_articles` to map API responses to Yana article format.
    - [x] Sub-task: Implement `enrich_articles` to fetch comments and build the content HTML.
- [x] Task: Implement Content Formatting. e74c3dc
    - [x] Sub-task: Ensure YouTube `<iframe>` embed is generated in the header.
    - [x] Sub-task: Format video description and comments section.
- [x] Task: Update Registry. e74c3dc
    - [x] Sub-task: Update `core/aggregators/registry.py` to point to the new implementation.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Aggregator Implementation' (Protocol in workflow.md)

## Phase 4: Admin Autocomplete
- [x] Task: Implement YouTube search for autocomplete. 4831274
    - [x] Sub-task: Add `get_identifier_choices` class method to `YoutubeAggregator` that calls YouTube API `search.list` (type=channel).
- [x] Task: Verify Autocomplete Integration. 4831274
    - [x] Sub-task: Ensure `FeedIdentifierAutocomplete` in `core/autocomplete.py` correctly triggers for the `youtube` aggregator type.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Admin Autocomplete' (Protocol in workflow.md)

## Phase 5: Verification and Testing
- [x] Task: Manual Test with `test_aggregator`. e74c3dc
    - [x] Sub-task: Run `python manage.py test_aggregator youtube "@mkbhd" --verbose --dry-run` to verify content extraction.
- [x] Task: Verify Admin UI. 4831274
    - [x] Sub-task: Create a new YouTube feed in Django Admin and verify the autocomplete functionality.
- [x] Task: Conductor - User Manual Verification 'Phase 5: Verification and Testing' (Protocol in workflow.md) e74c3dc
