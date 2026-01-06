# <img src="core/static/core/img/logo-icon-only.svg" width="40" height="40" align="center" style="margin-right: 10px;"> Yana - RSS Aggregator

A modern, self-hosted RSS aggregator built with Django that supports Google Reader API compatibility for use with external RSS clients like Reeder, NetNewsWire, and FeedMe.

## Features

- **Multi-source Content Aggregation**
  - RSS/Atom feeds
  - YouTube channels
  - Reddit subreddits
  - Podcasts
  - Specific websites (news, blogs, comics)
  - Extensible aggregator system for custom sources

- **Google Reader API Compatibility**
  - Use any Google Reader-compatible client (Reeder, NetNewsWire, FeedMe)
  - Full subscription management
  - Article read/starred state tracking
  - Stream filtering and pagination

- **Self-Hosted**
  - SQLite database (no PostgreSQL required)
  - Docker deployment (multi-stage optimized image)
  - Background task processing with django-q2
  - No external dependencies (Redis not required)

- **User-Friendly Admin Interface**
  - Django admin with custom bulk actions
  - Aggregate feeds directly from admin
  - Reload articles on demand
  - Filter and search articles

## Quick Start

### Local Development

```bash
# Clone and enter directory
git clone <repo>
cd Yana

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run migrations
python3 manage.py migrate

# Create admin user
python3 manage.py createsuperuser

# Start development server
python3 manage.py runserver
```

Access at:
- Admin: http://localhost:8000/admin/
- GReader API: http://localhost:8000/api/greader/*

### Docker

```bash
# Development
docker-compose up

# Production
docker-compose -f docker-compose.production.yml up

# Health check
curl http://localhost:8000/health/
```

Environment configuration via `.env` file (see `.env.example`).

## Architecture

### Core Components

**Django Models:**
- `FeedGroup` - Organize feeds by user
- `Feed` - Feed configuration (URL, aggregator type, limits)
- `Article` - Individual content items
- `GReaderAuthToken` - Google Reader API authentication

**Aggregator System:**
- Template Method pattern for extensibility
- 14 aggregator types (2 custom, 8 managed site-specific, 3 social)
- MeinMmo aggregator fully implemented as reference
- Support for async header extraction and image compression

**Google Reader API:**
- 11 endpoints for full Google Reader compatibility
- Authentication via SHA-256 hashed tokens
- Stream filtering by feed, label, or starred status
- Pagination with continuation tokens

**Services Layer:**
- `AggregatorService` - Trigger feeds and fetch content
- `ArticleService` - Reload article content
- `AuthService` - Token generation and validation
- `SubscriptionService` - Feed management
- `StreamService` - Article querying with caching
- `TagService` - Article state operations

### Project Structure

```
core/
├── models.py                  # 4 data models
├── admin.py                   # Custom admin interface
├── choices.py                 # 14 aggregator types
├── views/                     # Modularized views
│   ├── default.py             # Health check, YouTube proxy
│   └── greader/               # Google Reader API views
├── urls/                      # URL routing
│   ├── default.py
│   └── greader.py             # 11 GReader endpoints
├── services/                  # Business logic
│   ├── aggregator_service.py
│   ├── article_service.py
│   └── greader/               # 7 GReader services
├── aggregators/               # Content aggregation
│   ├── base.py                # BaseAggregator
│   ├── registry.py            # Factory pattern
│   ├── mein_mmo/              # Reference implementation
│   └── utils/                 # Shared utilities
└── migrations/                # Database schema

yana/                          # Django project config
├── settings.py
├── urls.py
├── wsgi.py
└── asgi.py
```

## Google Reader API

The application implements the Google Reader API for RSS client compatibility.

### Endpoints

- `POST /api/greader/accounts/ClientLogin` - Authenticate with email/password
- `GET /api/greader/reader/api/0/token` - Get session token
- `GET /api/greader/reader/api/0/user-info` - Get user information
- `GET /api/greader/reader/api/0/subscription/list` - List all subscriptions
- `POST /api/greader/reader/api/0/subscription/edit` - Add/remove/rename subscriptions
- `GET /api/greader/reader/api/0/tag/list` - List tags/labels
- `POST /api/greader/reader/api/0/edit-tag` - Mark articles as read/starred
- `POST /api/greader/reader/api/0/mark-all-as-read` - Mark stream as read
- `GET /api/greader/reader/api/0/unread-count` - Get unread counts
- `GET /api/greader/reader/api/0/stream/items/ids` - Get article IDs
- `GET/POST /api/greader/reader/api/0/stream/contents` - Get article contents

### Authentication

1. POST email/password to `/accounts/ClientLogin`
2. Receive auth token (SHA-256 hashed, 64-char hex)
3. Include in subsequent requests: `Authorization: GoogleLogin auth=TOKEN`

### Stream Formats

Articles can be filtered by:
- `feed/{id}` - Single feed
- `user/-/label/{name}` - Group/label
- `user/-/state/com.google/starred` - Starred items
- `user/-/state/com.google/reading-list` - All items

## Aggregators

### Supported Types (14 total)

| Type | Source | Status |
|------|--------|--------|
| `full_website` | Generic web scraper | Reference |
| `feed_content` | RSS/Atom feeds | Reference |
| `mein_mmo` | Gaming blog | Implemented |
| `youtube` | YouTube channels | Implemented |
| `reddit` | Reddit subreddits | Implemented |
| `podcast` | Podcast feeds | Implemented |
| `heise` | German tech news | Implemented |
| `merkur` | German news | Implemented |
| `tagesschau` | German news | Implemented |
| `explosm` | Web comics | Implemented |
| `dark_legacy` | Web comics | Implemented |
| `oglaf` | Web comics | Implemented |
| `caschys_blog` | Tech blog | Implemented |
| `mactechnews` | Apple tech news | Implemented |

### Creating New Aggregators

1. Create class extending `BaseAggregator` in `core/aggregators/`
2. Implement: `fetch_source_data()`, `parse_to_raw_articles()`
3. Optional hooks: `validate()`, `filter_articles()`, `enrich_articles()`, `finalize_articles()`
4. Register in `AGGREGATOR_CHOICES` (core/choices.py)
5. Add to registry (core/aggregators/registry.py)

Reference implementation: `core/aggregators/mein_mmo/` (complete with content extraction, embed processing, multi-page support)

## Development

### Environment Setup

**Required:** Python 3.11+, virtual environment

```bash
source venv/bin/activate
```

### Common Commands

```bash
# Development server
python3 manage.py runserver

# Django shell
python3 manage.py shell

# Database migrations
python3 manage.py makemigrations
python3 manage.py migrate

# Tests
python3 manage.py test

# Trigger feeds
python3 manage.py trigger_aggregator --feed-id=1
python3 manage.py trigger_aggregator --aggregator-type=mein_mmo
```

### Debugging Aggregators

**Use `python3 manage.py test_aggregator` for all aggregator debugging.** This command provides comprehensive debugging information.

```bash
# Quick test by feed ID
python3 manage.py test_aggregator 5

# Test by aggregator type + identifier (creates temp feed)
python3 manage.py test_aggregator heise "https://www.heise.de/"

# Show detailed output (first 3 articles)
python3 manage.py test_aggregator 5 --first 3

# Verbose mode: raw HTML, debug logs, full tracebacks
python3 manage.py test_aggregator 5 -v

# Dry-run: test without saving to database
python3 manage.py test_aggregator 5 --dry-run

# Debug CSS selectors
python3 manage.py test_aggregator 5 --selector-debug

# Limit articles (fast iteration)
python3 manage.py test_aggregator 5 --limit 2
```

**Output includes:**
- Feed configuration details
- Aggregator class and inheritance info
- Execution timing
- Article summaries (first 10)
- Article details with raw/processed content
- Data validation (missing fields, empty content, etc.)
- Database save summary

**Debugging workflow:**
1. Start: `python3 manage.py test_aggregator <ID> --limit 2` (fast)
2. Debug: `python3 manage.py test_aggregator <ID> --first 1 -v` (detailed)
3. Selectors: `python3 manage.py test_aggregator <ID> --selector-debug` (if needed)
4. Full test: `python3 manage.py test_aggregator <ID>` (when working)

See **CLAUDE.md** > **Aggregator Debugging Guide** for comprehensive debugging documentation.

### Admin Interface

Django admin at `http://localhost:8000/admin/` includes:

- **Feed Management:** View, create, edit, filter feeds
- **Bulk Actions:** Aggregate selected feeds, reload articles
- **Article Preview:** View raw and processed HTML
- **Token Management:** Manage GReader API tokens
- **User Management:** Create users, assign feeds

### Testing

```bash
# Run all tests
python3 manage.py test

# Run specific test
python3 manage.py test core.tests.TestClassName

# Run with coverage
coverage run --source='.' manage.py test
coverage report
```

Current test coverage is minimal - contributions welcome!

## Configuration

### Environment Variables (.env)

```
DEBUG=True|False
SECRET_KEY=your-secret-key
ALLOWED_HOSTS=localhost,127.0.0.1
DATABASE_ENGINE=django.db.backends.sqlite3
DATABASE_NAME=db.sqlite3
TIME_ZONE=UTC
SUPERUSER_USERNAME=admin
SUPERUSER_EMAIL=admin@example.com
SUPERUSER_PASSWORD=password
```

### Django Settings (yana/settings.py)

- **Database:** SQLite (configurable to PostgreSQL/MySQL)
- **Task Queue:** django-q2 with 4 workers, ORM broker (no Redis needed)
- **Static Files:** WhiteNoise with debug autorefresh
- **Cache:** Per-request cache for GReader unread counts (30s)

## Deployment

### Docker

**Development:**
```bash
docker-compose up
```

**Production:**
```bash
docker-compose -f docker-compose.production.yml up
```

**Health Check:**
```bash
curl http://localhost:8000/health/
```

### Docker Image

- Multi-stage build (optimized for size)
- Python 3.11-slim base
- Gunicorn (4 workers) + Django-Q daemon via Supervisor
- Health check endpoint included
- Unprivileged `yana` user

### Database

- **Default:** SQLite (included, no setup needed)
- **Production:** Can be configured to PostgreSQL/MySQL via environment
- **Migrations:** Auto-run via docker-entrypoint.sh

## Key Dependencies

- **Django 6.0** - Web framework
- **beautifulsoup4 4.14.3** - HTML parsing
- **requests 2.32.5** - HTTP client
- **lxml 6.0.2** - XML/HTML processing
- **Pillow 11.0.0** - Image processing
- **feedparser 6.0.12** - RSS/Atom parsing
- **django-q2 1.9.0** - Task queue
- **graphene-django 3.2.3** - GraphQL API
- **djangoql 0.18.1** - Advanced query language
- **gunicorn 21.2.0** - App server
- **whitenoise 6.6.0** - Static file serving
- **supervisor 4.2.5** - Process management

See `requirements.txt` for complete list.

## Implementation Status

### Complete ✅
- Core models and database
- Django admin with custom actions
- Aggregator system foundation
- All 14 aggregators (ported from TypeScript)
- Docker setup with Supervisor
- YouTube proxy endpoint
- Health check endpoint
- Partial Google Reader API

### In Progress 🔄
- GReader service implementations (7 modules active)
- GReader view handlers
- Article reload functionality
- GraphQL API integration

### To Do 📋
- Complete GReader service implementations
- Comprehensive test coverage
- Performance optimization and caching tuning

## Documentation

- **CLAUDE.md** - Developer guidelines and architecture overview
- **GREADER_IMPLEMENTATION_PLAN.md** - Detailed Google Reader API specification (426 lines)
- **core/aggregators/README.md** - Aggregator development guide
- **old/docs/** - Legacy TypeScript implementation (reference)
  - AGGREGATOR_FLOW.md - Aggregator patterns
  - TRPC_API.md - Original API structure

## Contributing

1. Create feature branch from `main`
2. Implement changes with tests
3. Ensure all tests pass: `python3 manage.py test`
4. Commit with clear messages
5. Create pull request

Note: This project uses a git worktree strategy with multiple branches:
- `main` - Primary branch
- `bright-mountain` - Current development branch
- Other worktrees: `clever-beacon`, `happy-beacon`

## License

This project is a Django rewrite of the original TypeScript/Angular/Express application.

## Performance

- **Unread count caching:** 30 seconds (GReader API)
- **Database indexes:** Optimized for common queries
- **Query optimization:** Uses select_related/prefetch_related
- **Background processing:** django-q2 for non-blocking aggregation
- **Docker:** Multi-stage build, minimal runtime (~200MB)

## Troubleshooting

**Virtual environment issues:**
```bash
# Deactivate and reactivate
deactivate
source venv/bin/activate
```

**Database issues:**
```bash
# Reset database (development only!)
rm db.sqlite3
python3 manage.py migrate
python3 manage.py createsuperuser
```

**Docker issues:**
```bash
# View logs
docker-compose logs -f

# Rebuild
docker-compose down
docker-compose up --build
```

## Support

For issues, questions, or feature requests:
1. Check existing documentation (CLAUDE.md, GREADER_IMPLEMENTATION_PLAN.md)
2. Review GitHub issues
3. Create detailed issue with reproduction steps

---

**Yana** - A modern, self-hosted RSS aggregator with Google Reader compatibility.
