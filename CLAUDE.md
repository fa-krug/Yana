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
└── management/commands/  # trigger_aggregator, test_aggregator

yana/settings.py       # Django 6.0, SQLite, django-q2 (ORM broker)
old/src/server/        # TypeScript reference for porting aggregators
```

## Models

| Model | Key Fields | Notes |
|-------|-----------|-------|
| FeedGroup | name, user | Unique (name, user) |
| Feed | name, aggregator, identifier, user, group, enabled | 14 aggregator types |
| Article | name, identifier, content, date, read, starred, feed | Use `select_related("feed")` |
| GReaderAuthToken | user, token (SHA-256), expires_at | For GReader API auth |

## Aggregator System

**Pattern:** Template Method - extend `BaseAggregator`, implement `fetch_source_data()` and `parse_to_raw_articles()`.

```python
class MyAggregator(BaseAggregator):
    def fetch_source_data(self):
        return requests.get(self.feed.identifier).text

    def parse_to_raw_articles(self, data):
        return [RawArticle(name=..., identifier=..., content=...)]
```

**Status:** Only `mein_mmo` fully implemented. Others are stubs - port from `old/src/server/aggregators/*.ts`.

**To add aggregator:**
1. Create class in `core/aggregators/`
2. Add to `AGGREGATOR_CHOICES` in `choices.py`
3. Register in `registry.py`

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
| MeinMmo aggregator | ✅ Complete (reference) |
| GReader API | 🔄 Partial (services scaffolded) |
| Other 13 aggregators | ❌ Stubs only |
| Test coverage | ❌ Minimal |

## References

- `GREADER_IMPLEMENTATION_PLAN.md` - GReader API spec
- `core/aggregators/README.md` - Aggregator guide
- `old/src/server/aggregators/*.ts` - TypeScript implementations to port
- `old/docs/AGGREGATOR_FLOW.md` - Aggregator patterns

## Git

Branches: `main` (primary), `bright-mountain` (current worktree), `clever-beacon`, `happy-beacon`
