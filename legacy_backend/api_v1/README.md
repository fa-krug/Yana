# Yana API v1

RESTful API for the Yana RSS feed aggregator, built with Django Ninja.

## Overview

This API provides endpoints for managing feeds, articles, and user preferences. It uses:
- **Django Ninja** for the REST API framework
- **Pydantic** for request/response validation
- **HTTP-only cookies** for authentication with CSRF protection
- **Automatic OpenAPI schema** generation at `/api/v1/docs`

## Authentication

The API uses HTTP-only cookies for authentication. After logging in via `/api/v1/auth/login`, the session cookie is automatically included in subsequent requests.

### Endpoints

- `POST /api/v1/auth/login` - Login with username/password
- `POST /api/v1/auth/logout` - Logout current user
- `GET /api/v1/auth/status` - Get current authentication status

## Feeds

Manage RSS/Atom feeds, YouTube channels, podcasts, and Reddit subreddits.

### Endpoints

- `GET /api/v1/feeds/` - List all feeds (paginated, filterable)
- `GET /api/v1/feeds/{id}` - Get feed details
- `POST /api/v1/feeds/` - Create new feed
- `PATCH /api/v1/feeds/{id}` - Update feed
- `DELETE /api/v1/feeds/{id}` - Delete feed
- `POST /api/v1/feeds/{id}/reload` - Reload feed (fetch new articles)
- `POST /api/v1/feeds/{id}/clear` - Clear all articles from feed

### Query Parameters

- `search` - Search by feed name
- `feed_type` - Filter by type (article, youtube, podcast, reddit)
- `enabled` - Filter by enabled status
- `page` - Page number for pagination
- `page_size` - Items per page

## Articles

View and manage articles from feeds.

### Endpoints

- `GET /api/v1/feeds/{feed_id}/articles` - List articles from feed (paginated)
- `GET /api/v1/articles/{id}` - Get article details with prev/next navigation
- `DELETE /api/v1/articles/{id}` - Delete article
- `POST /api/v1/articles/{id}/reload` - Reload article content
- `POST /api/v1/articles/mark-read` - Mark articles as read/unread
- `POST /api/v1/articles/mark-starred` - Mark articles as saved/unsaved (endpoint name kept for backward compatibility)

### Query Parameters

- `search` - Search in title or content
- `unread_only` - Show only unread articles
- `page` - Page number for pagination

## Aggregators

Get information about available feed aggregators.

### Endpoints

- `GET /api/v1/aggregators/` - List all aggregators
- `GET /api/v1/aggregators/grouped` - List aggregators grouped by type

### Query Parameters

- `search` - Search by aggregator name
- `type` - Filter by type (managed, social, custom)

## Statistics

Get dashboard statistics.

### Endpoints

- `GET /api/v1/statistics/` - Get statistics (feed counts, article counts, read percentages)

## API Documentation

Interactive API documentation (Swagger UI) is available at:

```
http://localhost:8000/api/v1/docs
```

This provides:
- All available endpoints
- Request/response schemas
- Try-it-out functionality
- OpenAPI spec download

## Development

### Testing Endpoints

Using curl:

```bash
# Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "password"}' \
  -c cookies.txt

# List feeds
curl http://localhost:8000/api/v1/feeds/ \
  -b cookies.txt

# Get statistics
curl http://localhost:8000/api/v1/statistics/ \
  -b cookies.txt
```

### Error Handling

The API returns standard HTTP status codes:
- `200 OK` - Successful request
- `201 Created` - Resource created successfully
- `400 Bad Request` - Invalid request data
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Access denied
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

Error responses include a detail message:

```json
{
  "detail": "Error message here"
}
```

## OpenAPI Schema

The OpenAPI schema can be downloaded from:

```
http://localhost:8000/api/v1/openapi.json
```

This can be used to generate Angular client code with `@hey-api/openapi-ts`.
