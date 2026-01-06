# CLAUDE.md

## Project Overview

**Yana** - Django 6.0 RSS aggregator with Google Reader API compatibility. Rewrite of TypeScript/Angular app (legacy code in `old/`).

Features: RSS/YouTube/Reddit/Podcast aggregation, GReader API for external clients (Reeder, NetNewsWire), django-q2 background tasks, per-user article states.

## Quick Reference

```bash
# ALWAYS activate venv first
source venv/bin/activate

# Common commands
python3 manage.py runserver          # Dev server
python3 manage.py test               # Run tests
python3 manage.py makemigrations && python3 manage.py migrate  # DB changes

# DEBUGGING (primary tool - use for all aggregator debugging)
python3 manage.py test_aggregator 5                              # Debug feed by ID
python3 manage.py test_aggregator tagesschau                     # Test by aggregator type (uses default identifier)
python3 manage.py test_aggregator tagesschau --limit 3 --first 2  # Limit articles and show details
python3 manage.py test_aggregator 5 --verbose                    # Detailed output (raw HTML, debug logs)
python3 manage.py test_aggregator 5 --dry-run                   # Test without saving to database
# NOTE: Do NOT provide identifier by default - aggregators have built-in defaults.
#       Only provide identifier for custom calls: test_aggregator heise "custom-url"

# SQLite optimization commands
python3 manage.py verify_sqlite_optimizations                  # Verify PRAGMA settings
python3 manage.py optimize_sqlite                              # Run PRAGMA optimize (periodic maintenance)
python3 manage.py optimize_sqlite --analyze                   # Also run ANALYZE

# Production commands
python3 manage.py trigger_aggregator --feed-id=1               # Trigger feed

# Docker
docker-compose up
curl http://localhost:8000/health/
```

**URLs:** Admin `http://localhost:8000/admin/` | API `http://localhost:8000/api/greader/*`

## Code Standards

| Rule | Standard |
|------|----------|
| Style | PEP 8, 120 char lines, double quotes, f-strings |
| Imports | Sort with `isort core/` |
| Models | Always add `__str__`, `Meta` class, indexes |
| Views | Thin views, business logic in services |
| Queries | Use `select_related()`/`prefetch_related()`, avoid N+1 |
| Errors | Use `get_object_or_404()` |
| Security | Validate input, hash tokens, no secrets in code |
| Tests | Write tests, run before commit |

## Project Structure

```
core/
├── models.py          # FeedGroup, Feed, Article, GReaderAuthToken
├── admin.py           # Custom admin with bulk actions
├── choices.py         # 14 aggregator types
├── db/
│   └── backends/
│       └── sqlite3/   # Optimized SQLite backend (WAL mode, performance PRAGMAs)
├── views/
│   ├── default.py     # Health check, YouTube proxy
│   └── greader/       # GReader API (auth, subscription, stream, tag)
├── urls/              # greader.py (11 endpoints), default.py
├── services/
│   ├── aggregator_service.py  # Feed triggering
│   ├── article_service.py     # Article reload
│   └── greader/               # Auth, subscription, stream, tag services
├── aggregators/
│   ├── base.py        # BaseAggregator (Template Method)
│   ├── registry.py    # Factory: get_aggregator(feed)
│   ├── mein_mmo/      # Reference implementation (fully working)
│   └── utils/         # Shared: html_fetcher, content_extractor, rss_parser
└── management/commands/  # trigger_aggregator, test_aggregator, verify_sqlite_optimizations

yana/settings.py       # Django 6.0, optimized SQLite, django-q2 (ORM broker)
old/src/server/        # TypeScript reference for porting aggregators
```

## Models

| Model | Key Fields | Notes |
|-------|-----------|-------|
| FeedGroup | name, user | Unique (name, user) |
| Feed | name, aggregator, identifier, user, group, enabled | 14 aggregator types |
| Article | name, identifier, content, date, read, starred, feed | Use `select_related("feed")` |
| GReaderAuthToken | user, token (SHA-256), expires_at | For GReader API auth |

## AI-Ready Guide: Creating a New Aggregator

Follow these steps to implement a new site-specific aggregator (e.g., porting from `old/src/server/aggregators/*.ts`).

### 1. Identify the Pattern
- **RSS only:** Inherit from `RssAggregator`.
- **Full content from website:** Inherit from `FullWebsiteAggregator` (most common for news sites).
- **Custom (API/Scraping):** Inherit from `BaseAggregator`.

### 2. Registration
1.  **`core/choices.py`**: Add the new type to `AGGREGATOR_CHOICES` (e.g., `("my_site", "My Site")`).
2.  **`core/aggregators/registry.py`**: Import your class and add it to `_registry`.
3.  **Migration**: Run `python3 manage.py makemigrations && python3 manage.py migrate`.

### 3. Implementation (FullWebsiteAggregator Example)
Create `core/aggregators/my_site/aggregator.py`:

```python
from ..website import FullWebsiteAggregator
from ..utils import clean_html, format_article_content

class MySiteAggregator(FullWebsiteAggregator):
    # Required for GReader API
    def get_source_url(self): return "https://mysite.com"

    # Selectors for main content
    content_selector = "div.article-body"

    # Selectors to strip
    selectors_to_remove = [
        "div.ads", ".social-buttons", "script", "style"
    ]

    # Optional: specialized extraction logic
    def extract_content(self, html: str, article: dict) -> str:
        # Custom BeautifulSoup logic if content_selector is insufficient
        return super().extract_content(html, article)

    # Optional: custom processing (cleaning, formatting)
    def process_content(self, html: str, article: dict) -> str:
        # Use clean_html() and format_article_content()
        return super().process_content(html, article)
```

### 4. Reference Implementation
See `core/aggregators/mein_mmo/` for a "gold standard" implementation featuring:
- Multi-page article handling (`multipage_handler.py`).
- Specialized content extraction (`content_extraction.py`).
- Custom embed processing (YouTube, Twitter, etc.).

### 5. Verification
Test your new aggregator using the management command:
```bash
# Test by aggregator type (uses default identifier if configured in __init__):
python3 manage.py test_aggregator my_site

# IMPORTANT: Only provide identifier for CUSTOM calls (to override default):
python3 manage.py test_aggregator my_site "https://mysite.com/custom-feed.xml"

# Or create a test feed in Django Admin first, then test by feed ID:
python3 manage.py test_aggregator 5

# Use --dry-run to test without saving to database:
python3 manage.py test_aggregator my_site --dry-run

# Use --verbose to see detailed output:
python3 manage.py test_aggregator my_site --verbose

# Or use the generic trigger:
python3 manage.py trigger_aggregator --feed-id <ID>
```

---

## Aggregator Debugging Guide

**IMPORTANT:** Always use `python3 manage.py test_aggregator` when debugging aggregators. This is the primary tool for all debugging work.

### Quick Start

```bash
# Test by feed ID (already configured in database)
python3 manage.py test_aggregator 5

# Test by aggregator type (uses default identifier - DO NOT provide identifier by default)
python3 manage.py test_aggregator tagesschau
python3 manage.py test_aggregator heise
python3 manage.py test_aggregator mein_mmo

# IMPORTANT: Only provide identifier for CUSTOM calls (to override default)
# This is for testing with a different URL/identifier than the built-in default
python3 manage.py test_aggregator heise "https://www.heise.de/rss/heise-security.rdf"

# Show detailed output for first 3 articles
python3 manage.py test_aggregator 5 --first 3

# Verbose mode: see raw/processed HTML, debug logs, full tracebacks
python3 manage.py test_aggregator 5 --verbose

# Dry-run: test aggregation without saving to database (useful for testing)
python3 manage.py test_aggregator 5 --dry-run

# Debug CSS selectors (for FullWebsiteAggregator)
python3 manage.py test_aggregator 5 --selector-debug

# Limit articles aggregated (useful for fast iterations)
python3 manage.py test_aggregator 5 --limit 3

# Combine options: test with limit, verbose output, and dry-run
python3 manage.py test_aggregator tagesschau --limit 2 --first 1 --verbose --dry-run
```

**Default Identifiers:** Most aggregators have default identifiers configured in their `__init__` method. **Do NOT provide an identifier parameter by default** - the aggregator will use its built-in default. Only provide an identifier when you need to test with a custom URL/identifier that differs from the default.

Examples of aggregators with built-in defaults:
- `tagesschau` → `https://www.tagesschau.de/xml/rss2/`
- `heise` → `https://www.heise.de/rss/heise.rdf`
- `mein_mmo` → `https://www.mein-mmo.de/feed/`

For aggregators without defaults, you must provide the identifier as the second argument.

### Command Output Sections

The command outputs comprehensive debugging info in these sections:

1. **FEED CONFIGURATION** - How the feed is configured
   - Aggregator type (e.g., "heise")
   - Identifier (URL or ID)
   - Daily limit, enabled status
   - Feed name and ID

2. **AGGREGATOR CLASS INFO** - Details about the aggregator implementation
   - Full class path (module.ClassName)
   - Base classes (FullWebsiteAggregator, RssAggregator, etc.)
   - Source URL (if available)
   - CSS selectors (with `--selector-debug`)

3. **AGGREGATION RUN** - Execution results
   - Time elapsed (performance metric)
   - Number of articles returned

4. **ARTICLE SUMMARIES** - Quick overview of first 10 articles
   - Title, URL, content sizes, date

5. **ARTICLE DETAILS** - Deep dive into first N articles (--first flag)
   - Full name, URL, date, author
   - Raw and processed content lengths
   - First 800 chars of raw/processed HTML (with --verbose flag)

6. **VALIDATION** - Data quality checks
   - Missing required fields (name, identifier, content, raw_content)
   - Empty content warnings
   - Missing dates
   - Green checkmark if all articles pass validation

7. **DATABASE SAVE** - Save results
   - Count of created/updated/failed articles
   - Success confirmation

### Common Debugging Scenarios

**No articles returned:**
```bash
# Run with verbose to see debug logs
python3 manage.py test_aggregator 5 --verbose
```
Look for logs showing: which URLs were fetched, parsing errors, selector mismatches.

**Bad content extraction:**
```bash
# See the raw HTML and processed output
python3 manage.py test_aggregator 5 --first 1 --verbose

# If using FullWebsiteAggregator, debug selectors
python3 manage.py test_aggregator 5 --selector-debug
```
Compare raw vs processed content to see if selectors are matching wrong elements.

**Slow aggregation:**
```bash
# Time elapsed is shown - check if too high
python3 manage.py test_aggregator 5

# Test with limited articles for faster iteration
python3 manage.py test_aggregator 5 --limit 2
```

**Database save failures:**
```bash
# Run normally to see error messages
python3 manage.py test_aggregator 5

# Use --dry-run if you want to test aggregation without saving
python3 manage.py test_aggregator 5 --dry-run
```

### Debugging Workflow

1. Create feed or use existing feed ID, or test by aggregator type
2. Run: `python3 manage.py test_aggregator <ID or type> --limit 2` (fast check)
3. If issues, run: `python3 manage.py test_aggregator <ID or type> --first 1 --verbose` (detailed output)
4. If content is wrong, run: `python3 manage.py test_aggregator <ID or type> --selector-debug` (selector help)
5. Use `--dry-run` to test without saving: `python3 manage.py test_aggregator <ID or type> --dry-run`
6. Once working, test full run: `python3 manage.py test_aggregator <ID or type>`

---

## Google Reader API

**Endpoints** (core/urls/greader.py):
- `POST /accounts/ClientLogin` - Auth with email/password
- `GET /token`, `GET /user-info` - Session management
- `GET/POST /subscription/*` - Feed management
- `GET/POST /tag/*`, `/edit-tag`, `/mark-all-as-read` - Article states
- `GET /unread-count`, `/stream/items/ids`, `/stream/contents` - Article delivery

**Auth:** `Authorization: GoogleLogin auth=TOKEN` header. Tokens are SHA-256 hashed.

**Stream IDs:** `feed/{id}` | `user/-/label/{name}` | `user/-/state/com.google/starred`

**Item ID:** `tag:google.com,2005:reader/item/{16-hex}` (Article 123 → `000000000000007b`)

See `GREADER_IMPLEMENTATION_PLAN.md` for full spec.

## Key Patterns

**Layer Separation:**
- Views: Request handling only, call services
- Services: All business logic (testable, reusable)
- Models: Data structure, no business logic

**Query Optimization:**
```python
# ✅ Good
Article.objects.select_related("feed").filter(...)
Feed.objects.prefetch_related("article_set").all()

# ❌ Bad - N+1 queries
for article in Article.objects.all():
    print(article.feed.name)
```

**Error Handling:**
```python
feed = get_object_or_404(Feed, id=feed_id)  # ✅ Use this
```

## SQLite Performance Optimizations

The project uses a custom optimized SQLite backend (`core.db.backends.sqlite3`) with performance PRAGMA settings:

- **WAL mode**: Better concurrency, faster writes
- **Cache size**: 64MB (vs default 2MB)
- **Memory-mapped I/O**: 256MB for faster file access
- **Synchronous NORMAL**: Balanced safety/performance
- **Temp store in memory**: Faster temporary operations
- **Busy timeout**: 30s to prevent lock contention

**Verify optimizations:**
```bash
python3 manage.py verify_sqlite_optimizations
```

**See:** `core/db/README.md` for detailed documentation and tuning guide.

## Environment (.env)

```
DEBUG=True
SECRET_KEY=change-me
ALLOWED_HOSTS=localhost,127.0.0.1
SUPERUSER_USERNAME=admin
SUPERUSER_EMAIL=admin@example.com
SUPERUSER_PASSWORD=password
```

## Implementation Status

| Component | Status |
|-----------|--------|
| Models, Admin, Docker | ✅ Complete |
| SQLite performance optimizations | ✅ Complete (Django 6 approach) |
| Aggregator System | ✅ Complete (14 types implemented) |
| GReader API | 🔄 Partial (services active) |
| Test coverage | ❌ Minimal |

## References

- `GREADER_IMPLEMENTATION_PLAN.md` - GReader API spec
- `core/aggregators/README.md` - Aggregator guide
- `core/db/README.md` - SQLite performance optimizations
- `old/src/server/aggregators/*.ts` - TypeScript implementations to port
- `old/docs/AGGREGATOR_FLOW.md` - Aggregator patterns

## Git

Branches: `main` (primary), `bright-mountain` (current worktree), `clever-beacon`, `happy-beacon`
