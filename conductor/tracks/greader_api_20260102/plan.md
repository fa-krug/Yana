# Track Plan: Complete the GReader API Implementation

## Phase 1: Authentication & User Info
- [x] Task: Create `GReaderAuthToken` model tests (b4c08b8)
    - **Sub-task:** Write tests for token creation, validation, and expiry.
    - **Sub-task:** Implement model methods if missing.
- [x] Task: Implement `ClientLogin` view (manual-verify)
    - **Sub-task:** Write integration tests for `POST /accounts/ClientLogin` (success, fail, missing args).
    - **Sub-task:** Implement the view to validate credentials and return `SID`/`Auth` tokens.
- [x] Task: Implement `token` endpoint (pytest-migrated)
    - **Sub-task:** Write tests for `GET /token` (requires valid session).
    - **Sub-task:** Implement view to return a short-lived action token.
- [x] Task: Implement `user-info` endpoint (pytest-migrated)
    - **Sub-task:** Write tests for `GET /user-info`.
    - **Sub-task:** Implement view to return JSON user profile.

## Phase 2: Tag & Subscription Management (Read/Write)
- [x] Task: Implement `tag/list` service and view (4b5d470)
    - **Sub-task:** Write tests for retrieving all user tags (folders, states).
    - **Sub-task:** Implement service to fetch `FeedGroup` and special states (starred/read).
    - **Sub-task:** Connect view to service.
- [ ] Task: Implement `subscription/list` service and view
    - **Sub-task:** Write tests for listing all subscribed feeds.
    - **Sub-task:** Implement service to serialize `Feed` objects to GReader format.
    - **Sub-task:** Connect view to service.
- [ ] Task: Implement `subscription/edit` (Subscribe/Unsubscribe)
    - **Sub-task:** Write tests for subscribing to a new URL and unsubscribing.
    - **Sub-task:** Implement service to handle `ac=subscribe` and `ac=unsubscribe`.
    - **Sub-task:** Connect view to service.
- [ ] Task: Implement `edit-tag` (Folder management)
    - **Sub-task:** Write tests for adding/removing feeds from folders (tags).
    - **Sub-task:** Implement service to handle `a` (add tag) and `r` (remove tag) operations for feeds.
    - **Sub-task:** Connect view to service.

## Phase 3: Stream & Item Retrieval (Read)
- [ ] Task: Implement `stream/items/ids` service and view
    - **Sub-task:** Write tests for fetching ID lists with filters (read/unread, feed, label).
    - **Sub-task:** Implement service to query `Article` table efficiently and return hex IDs.
    - **Sub-task:** Connect view to service.
- [ ] Task: Implement `stream/contents` service and view
    - **Sub-task:** Write tests for fetching full content (Atom/JSON) for given IDs or streams.
    - **Sub-task:** Implement service to serialize `Article` objects to Atom/JSON.
    - **Sub-task:** Implement pagination logic (continuation).
    - **Sub-task:** Connect view to service.

## Phase 4: Article State Management (Write)
- [ ] Task: Implement `edit-tag` for Articles (Read/Star)
    - **Sub-task:** Write tests for marking articles as read/unread and starred/unstarred.
    - **Sub-task:** Implement service to handle `i` (item ID) with `a` (add state) and `r` (remove state).
    - **Sub-task:** Connect view to service.
- [ ] Task: Implement `mark-all-as-read`
    - **Sub-task:** Write tests for bulk marking items as read (by feed or global).
    - **Sub-task:** Implement service to perform efficient bulk updates.
    - **Sub-task:** Connect view to service.

## Phase 5: Verification & Polish
- [ ] Task: Verify API against Reeder/NetNewsWire
    - **Sub-task:** Manual testing with actual clients (if possible via local network/tunnel).
    - **Sub-task:** Fix any compatibility quirks discovered.
- [ ] Task: Performance Tuning
    - **Sub-task:** Analyze query performance for `stream/items/ids`.
    - **Sub-task:** Add database indexes if missing.
