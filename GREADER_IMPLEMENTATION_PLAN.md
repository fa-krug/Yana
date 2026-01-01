# Google Reader API Implementation Plan

## Overview

This plan ports the Google Reader API from TypeScript/Express to Django using plain Django views (no Django REST Framework). The API provides RSS reader compatibility for external clients like Reeder, NetNewsWire, and similar apps.

---

## 1. Database Models

### 1.1 GReaderAuthToken Model

**File:** `core/models.py`

New model to add:

```python
class GReaderAuthToken(models.Model):
    """Google Reader API authentication token."""

    user = models.ForeignKey(
        "auth.User",
        on_delete=models.CASCADE,
        related_name="greader_tokens"
    )
    token = models.CharField(max_length=64, unique=True, db_index=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Google Reader Auth Token"
        verbose_name_plural = "Google Reader Auth Tokens"
        indexes = [
            models.Index(fields=["token"]),
            models.Index(fields=["user"]),
        ]
```

### 1.2 UserArticleState Model

**File:** `core/models.py`

New model to add:

```python
class UserArticleState(models.Model):
    """Tracks per-user read/starred state for articles."""

    user = models.ForeignKey(
        "auth.User",
        on_delete=models.CASCADE,
        related_name="article_states"
    )
    article = models.ForeignKey(
        Article,
        on_delete=models.CASCADE,
        related_name="user_states"
    )
    is_read = models.BooleanField(default=False)
    is_saved = models.BooleanField(default=False)  # starred
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "User Article State"
        verbose_name_plural = "User Article States"
        unique_together = [["user", "article"]]
        indexes = [
            models.Index(fields=["user", "article"]),
            models.Index(fields=["user", "is_read"]),
            models.Index(fields=["user", "is_saved"]),
            models.Index(fields=["user", "article", "is_read"]),
        ]
```

---

## 2. Directory Structure

```
core/
├── views/
│   ├── __init__.py
│   └── greader/
│       ├── __init__.py
│       ├── decorators.py    # Authentication decorator
│       ├── auth.py          # Authentication views
│       ├── subscription.py  # Subscription management
│       ├── tag.py           # Tag/state operations
│       └── stream.py        # Stream content delivery
│
├── services/
│   ├── __init__.py
│   └── greader/
│       ├── __init__.py
│       ├── exceptions.py              # Custom exceptions
│       ├── auth_service.py            # Token generation/validation
│       ├── subscription_service.py    # Subscription logic
│       ├── tag_service.py             # Tag/state operations
│       ├── stream_service.py          # Stream querying
│       ├── stream_filter_builder.py   # Query filtering
│       └── stream_format.py           # Response formatting
│
├── urls/
│   ├── __init__.py
│   └── greader.py           # GReader URL patterns
```

---

## 3. URL Routing Structure

### Main Configuration

Update `yana/urls.py`:

```python
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/greader/", include("core.urls.greader")),
    # ... other patterns
]
```

### GReader URLs

Create `core/urls/greader.py` with these patterns:

- `POST /api/greader/accounts/ClientLogin` - Login with email/password
- `GET /api/greader/reader/api/0/token` - Get session token
- `GET /api/greader/reader/api/0/user-info` - Get user information
- `GET /api/greader/reader/api/0/subscription/list` - List subscriptions
- `POST /api/greader/reader/api/0/subscription/edit` - Edit subscription
- `GET /api/greader/reader/api/0/tag/list` - List tags/groups
- `POST /api/greader/reader/api/0/edit-tag` - Mark articles as read/starred
- `POST /api/greader/reader/api/0/mark-all-as-read` - Mark all as read
- `GET /api/greader/reader/api/0/unread-count` - Get unread counts
- `GET /api/greader/reader/api/0/stream/items/ids` - Get article IDs
- `GET/POST /api/greader/reader/api/0/stream/contents` - Get article contents

---

## 4. Authentication Mechanism

### Token Format and Storage

- **Auth tokens:** SHA-256 hashes (64-char hex), long-lived by default
- **Session tokens:** 57 chars, short-lived for CSRF protection
- **Storage:** GReaderAuthToken model with optional expiry

### Authentication Flow

1. User POSTs email/password to `/accounts/ClientLogin`
2. System validates credentials and generates auth token
3. User includes `Authorization: GoogleLogin auth=TOKEN` header in subsequent requests
4. Decorator validates token from header or falls back to session

### Decorator Implementation

Create `@greader_auth_required` decorator in `core/views/greader/decorators.py` that:
- Extracts auth header
- Queries GReaderAuthToken by token
- Validates expiry
- Attaches user to request object
- Returns 401 if authentication fails

---

## 5. Endpoint Categories

### Authentication Endpoints

**ClientLogin (POST):** Parse email/password, validate, return auth token in text format
**Token (GET):** Return short-lived session token
**User-Info (GET):** Return user details as JSON

### Subscription Endpoints

**List (GET):** Return all user subscriptions with groups as JSON
**Edit (POST):** Add/remove subscriptions, rename, add/remove labels

### Tag Endpoints

**List (GET):** Return standard states + user groups as JSON
**Edit-Tag (POST):** Mark individual articles as read/starred in bulk
**Mark-All-As-Read (POST):** Mark articles matching stream filter as read

### Stream Endpoints

**Unread-Count (GET):** Return unread article counts per feed
**Stream-Items-IDs (GET):** Return article IDs from stream with filtering
**Stream-Contents (GET/POST):** Return full article data with pagination

---

## 6. Key Service Implementations

### Authentication Service (`core/services/greader/auth_service.py`)

- `authenticate_with_credentials(email, password)` - Validate user, create token
- `authenticate_request(auth_header, session_user_id)` - Extract user from request
- `generate_auth_token(username, user_id)` - Create long-lived token
- `generate_session_token(user_id)` - Create short-lived token

### Subscription Service (`core/services/greader/subscription_service.py`)

- `list_subscriptions(user_id)` - Query feeds, format as subscriptions with groups
- `edit_subscription(user_id, options)` - Handle subscribe/unsubscribe/rename/label operations

### Tag Service (`core/services/greader/tag_service.py`)

- `list_tags(user_id)` - Return standard tags + custom labels
- `edit_tags(user_id, item_ids, add_tag, remove_tag)` - Batch update article states
- `mark_all_as_read(user_id, stream_id, timestamp)` - Mark stream articles as read

### Stream Service (`core/services/greader/stream_service.py`)

- `get_unread_count(user_id, include_all)` - Return per-feed unread counts (cached 30s)
- `get_stream_item_ids(user_id, stream_id, ...)` - Return filtered article IDs
- `get_stream_contents(user_id, stream_id, ...)` - Return full articles with pagination

### Stream Filter Builder (`core/services/greader/stream_filter_builder.py`)

- `StreamFilterOrchestrator` class using Strategy pattern
- Filter classes: `FeedFilter`, `LabelFilter`, `StarredFilter`, `DefaultFilter`
- Each filter handles specific stream ID format and builds Django ORM Q objects

### Stream Format (`core/services/greader/stream_format.py`)

- ID encoding: Convert integer article IDs to/from 16-char hex format
- Item formatting: Convert Article model to Google Reader stream item JSON
- Response building: Format subscriptions, tags, and items

---

## 7. Critical Implementation Details

### Access Control

- Users access feeds where: `Feed.user == current_user OR Feed.user IS NULL`
- Users can only modify states for accessible articles
- Users can only unsubscribe/rename feeds they own

### Stream ID Formats

- `feed/{id}` - Single feed
- `user/-/label/{name}` - Custom group or special label (Reddit/YouTube/Podcasts)
- `user/-/state/com.google/starred` - Starred items
- `user/-/state/com.google/reading-list` - All items

### Item ID Format

- Full: `tag:google.com,2005:reader/item/{16-char-hex}`
- Article ID 123 → `tag:google.com,2005:reader/item/000000000000007b`

### Response Formats

- **JSON endpoints:** subscription/list, user-info, tag/list, unread-count, stream contents
- **Text endpoints:** ClientLogin, token, edit operations (return "OK" or error text)

---

## 8. Implementation Order (Dependencies First)

### Phase 1: Foundation
1. Add GReaderAuthToken and UserArticleState models to `core/models.py`
2. Create migration and run it
3. Register models in `core/admin.py`

### Phase 2: Utilities
4. Create `/core/services/greader/` directory structure
5. Implement `stream_format.py` (ID encoding, item formatting)
6. Write unit tests for formatting

### Phase 3: Authentication
7. Implement `auth_service.py` (token generation, validation)
8. Implement `decorators.py` (@greader_auth_required)
9. Implement auth views (ClientLogin, token, user-info)
10. Write integration tests

### Phase 4: Subscriptions
11. Implement `subscription_service.py`
12. Implement subscription views
13. Write integration tests

### Phase 5: Tags
14. Implement `tag_service.py`
15. Implement tag views
16. Write integration tests

### Phase 6: Streams (Most Complex)
17. Implement `stream_filter_builder.py` (filtering logic)
18. Implement `stream_service.py` (queries, caching)
19. Implement stream views
20. Write integration tests

### Phase 7: Integration
21. Create `core/urls/greader.py` with all URL patterns
22. Update `yana/urls.py` to include greader URLs
23. Integration testing with actual RSS reader apps
24. Documentation

---

## 9. Error Handling

### Custom Exceptions (`core/services/greader/exceptions.py`)

- `GReaderException` - Base exception
- `AuthenticationError` - Failed auth
- `PermissionDeniedError` - Access denied
- `NotFoundError` - Resource missing
- `ValidationError` - Invalid input

### Response Codes

- 200 OK - Success
- 400 Bad Request - Invalid input
- 401 Unauthorized - Auth failed
- 403 Forbidden - Permission denied
- 404 Not Found - Resource missing
- 500 Internal Server Error - Unexpected errors

---

## 10. Performance Optimizations

### Database Indexes

- GReaderAuthToken: token, user
- UserArticleState: (user, article), (user, is_read), (user, is_saved)
- Article: feed, date (already exist)

### Query Optimization

- Use `select_related()` for feed joins
- Use `prefetch_related()` for feed groups
- Limit result sets before complex filters
- Use `only()` for specific fields

### Caching

- Cache unread counts for 30 seconds
- Invalidate on state changes
- Django cache framework with key pattern: `greader:unread:{user_id}`

---

## 11. Testing Strategy

Create test suite in `core/tests/`:

- `test_greader_auth.py` - Authentication tests
- `test_greader_subscription.py` - Subscription tests
- `test_greader_tag.py` - Tag/state tests
- `test_greader_stream.py` - Stream tests

Test coverage:
- Authentication flow (valid/invalid credentials, token expiry)
- Subscription operations (list, edit, labels)
- Article state operations (read, starred, bulk operations)
- Stream filtering (by feed, label, starred, timestamp)
- Stream pagination (continuation tokens)
- Access control (users can only access their own content)

---

## 12. Security Considerations

- **Token Storage:** SHA-256 hashed, unique, indexed
- **Password Validation:** Use Django's `authenticate()` function
- **Authorization:** Verify ownership before modifications
- **Input Validation:** Sanitize all user input (stream IDs, item IDs, limits)
- **Rate Limiting:** Consider adding in future

---

## 13. Integration with Existing Code

### Model Changes

- Add GReaderAuthToken and UserArticleState to models
- Keep existing Article.read and Article.starred for compatibility
- UserArticleState allows multi-user support

### Admin Interface

- Register new models in `core/admin.py`
- Add fieldsets for organization
- Add search and filtering

### Future Migration

- Optionally migrate existing Article states to UserArticleState
- Deprecate direct read/starred fields if needed

---

## 14. Reference Files from Old Implementation

These TypeScript files are reference implementations to port:

- `old/src/server/routes/greader.ts` - Route structure
- `old/src/server/services/greader/auth.service.ts` - Auth logic
- `old/src/server/services/greader/subscription.service.ts` - Subscription logic
- `old/src/server/services/greader/stream.service.ts` - Stream queries
- `old/src/server/services/greader/tag.service.ts` - Tag operations
- `old/src/server/services/greader/stream-filter-builder.ts` - Filtering
- `old/src/server/services/greader/stream-format.service.ts` - Formatting

---

## Success Criteria

- All endpoints accessible at `/api/greader/*` paths
- Compatible with Google Reader API clients (Reeder, NetNewsWire, FeedMe, etc.)
- Full CRUD operations on subscriptions
- Batch operations on article states
- Proper access control (users access only their content)
- Comprehensive test coverage
- No breaking changes to existing Django application
- Performance meets baseline (< 100ms for most endpoints)
