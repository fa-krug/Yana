# Plan: YouTube Aggregator Reimplementation

This plan outlines the steps to reimplement the YouTube aggregator in Python, including the removal of legacy fields and the addition of admin autocomplete functionality.

## Phase 1: Database and Model Cleanup
- [x] Task: Verify `youtube_enabled` in `UserSettings` model.
    - [x] Sub-task: Ensure the `youtube_enabled` field exists in `core.models.UserSettings`.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Database and Model Cleanup' (Protocol in workflow.md)

## Phase 2: YouTube API Service Layer
- [ ] Task: Implement YouTube API client.
    - [ ] Sub-task: Create `core/aggregators/utils/youtube_client.py` to handle raw API requests (channels, playlistItems, videos, commentThreads).
    - [ ] Sub-task: Implement quota-efficient batching for video details.
- [ ] Task: Implement Channel Resolution logic.
    - [ ] Sub-task: Create logic to resolve handles (@name), IDs (UC...), and URLs to a canonical Channel ID.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: YouTube API Service Layer' (Protocol in workflow.md)

## Phase 3: Aggregator Implementation
- [ ] Task: Create `YoutubeAggregator` class in `core/aggregators/youtube/aggregator.py`.
    - [ ] Sub-task: Implement `fetch_source_data` using the API client.
    - [ ] Sub-task: Implement `parse_to_raw_articles` to map API responses to Yana article format.
    - [ ] Sub-task: Implement `enrich_articles` to fetch comments and build the content HTML.
- [ ] Task: Implement Content Formatting.
    - [ ] Sub-task: Ensure YouTube `<iframe>` embed is generated in the header.
    - [ ] Sub-task: Format video description and comments section.
- [ ] Task: Update Registry.
    - [ ] Sub-task: Update `core/aggregators/registry.py` to point to the new implementation.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Aggregator Implementation' (Protocol in workflow.md)

## Phase 4: Admin Autocomplete
- [ ] Task: Implement YouTube search for autocomplete.
    - [ ] Sub-task: Add `get_identifier_choices` class method to `YoutubeAggregator` that calls YouTube API `search.list` (type=channel).
- [ ] Task: Verify Autocomplete Integration.
    - [ ] Sub-task: Ensure `FeedIdentifierAutocomplete` in `core/autocomplete.py` correctly triggers for the `youtube` aggregator type.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Admin Autocomplete' (Protocol in workflow.md)

## Phase 5: Verification and Testing
- [ ] Task: Manual Test with `test_aggregator`.
    - [ ] Sub-task: Run `python manage.py test_aggregator youtube "@mkbhd" --verbose --dry-run` to verify content extraction.
- [ ] Task: Verify Admin UI.
    - [ ] Sub-task: Create a new YouTube feed in Django Admin and verify the autocomplete functionality.
- [ ] Task: Conductor - User Manual Verification 'Phase 5: Verification and Testing' (Protocol in workflow.md)
