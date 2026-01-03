# Track Specification: Complete the GReader API Implementation

## Objective
To implement a fully compatible Google Reader API backend for Yana, enabling users to synchronize their RSS feeds, read states, and starred articles with external clients like Reeder, NetNewsWire, and FeedMe.

## Context
Yana currently has a scaffolded GReader API structure, but key services and views are missing or incomplete. The existing `GREADER_IMPLEMENTATION_PLAN.md` provides a roadmap, but it needs to be executed systematically. The goal is to move from a partial implementation to a production-ready API.

## Requirements

### Authentication
- [ ] Implement `ClientLogin` endpoint (legacy auth used by many GReader clients).
- [ ] Implement `token` endpoint for session management.
- [ ] Ensure secure handling of authentication tokens.

### Subscription Management
- [ ] Implement `subscription/list` to return all user subscriptions.
- [ ] Implement `subscription/edit` to add/remove feeds and move them between folders.
- [ ] Ensure correct mapping between internal `Feed` models and GReader API response formats.

### Stream & Item Delivery
- [ ] Implement `stream/items/ids` to return efficient lists of article IDs.
- [ ] Implement `stream/contents` to return full article data (Atom/JSON).
- [ ] Support standard GReader streams:
    - `user/-/state/com.google/reading-list` (All items)
    - `user/-/state/com.google/starred` (Starred items)
    - `user/-/state/com.google/read` (Read items)
    - Feed-specific streams (e.g., `feed/<feed_id>`)
    - Label-specific streams (e.g., `user/-/label/<label_name>`)
- [ ] Implement pagination (continuation tokens).
- [ ] Implement proper filtering (exclude read items, fetch by tag).

### State Management (Tags)
- [ ] Implement `edit-tag` to handle state changes (Mark as Read, Star/Unstar).
- [ ] Implement `mark-all-as-read` for bulk status updates.
- [ ] Implement `disable-tag` (if applicable/supported by clients).
- [ ] Implement `tag/list` to return all available tags/folders.

### User Info & Preferences
- [ ] Implement `user-info` to return basic user profile data.
- [ ] Implement `preference/list` and `preference/stream/list` (stubbed or functional).

## Non-Functional Requirements
- **Performance:** Endpoints must be fast, especially `stream/items/ids` and `edit-tag`, to ensure a snappy client experience.
- **Compatibility:** strict adherence to the Google Reader API de-facto standard (reverse-engineered specs).
- **Error Handling:** Graceful handling of invalid inputs and authentication failures.
- **Testing:** Comprehensive test coverage (>80%) for all API endpoints and services.

## Out of Scope
- Implementation of a custom web frontend (we are relying on external clients).
- Implementation of new aggregators (this track focuses on the API for *existing* data).
