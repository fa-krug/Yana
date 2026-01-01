# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Yana** - A Django-based RSS aggregator and feed management system. This is a Django rewrite of the original TypeScript/Angular/Express application (preserved in the `old/` directory).

The application aggregates content from various sources (RSS feeds, YouTube, Reddit, podcasts, specific websites) and provides a unified interface for managing and reading articles.

## ⚠️ Virtual Environment Requirement

**CRITICAL: Always use the virtual environment when working with this project.**

This project MUST be run within its virtual environment to ensure correct dependencies and isolation from system Python packages.

### Activating the Virtual Environment

**Before running ANY Python commands, always activate the virtual environment:**

```bash
# On macOS/Linux:
source venv/bin/activate

# On Windows:
venv\Scripts\activate

# You'll know it's activated when you see (venv) in your terminal prompt
```

### Deactivating (when done working)

```bash
deactivate
```

## Quick Start Commands

### Setup

```bash
# Create virtual environment (only needed once)
python3 -m venv venv

# Activate virtual environment (REQUIRED - do this every time)
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run migrations
python3 manage.py migrate

# Create superuser
python3 manage.py createsuperuser
```

### Development

**⚠️ REMINDER: Ensure virtual environment is activated before running these commands!**

```bash
# Verify virtual environment is active (should show (venv) in prompt)
# If not active, run: source venv/bin/activate

# Run development server
python3 manage.py runserver

# Create new migrations after model changes
python3 manage.py makemigrations

# Apply migrations
python3 manage.py migrate

# Open Django shell
python3 manage.py shell

# Access admin interface at http://localhost:8000/admin/
```

### Testing

**⚠️ REMINDER: Ensure virtual environment is activated before running tests!**

```bash
# Run tests
python3 manage.py test

# Run specific test
python3 manage.py test core.tests.TestClassName
```

## Architecture

### Project Structure

```
yana/                    # Django project settings
├── settings.py         # Main configuration
├── urls.py            # Root URL configuration
├── wsgi.py            # WSGI entry point
└── asgi.py            # ASGI entry point

core/                   # Main Django app
├── models.py          # Data models (FeedGroup, Feed, Article)
├── admin.py           # Django admin configuration
├── views.py           # View logic
├── choices.py         # Model field choices (aggregator types)
└── migrations/        # Database migrations

old/                    # Legacy TypeScript/Angular codebase (reference)
├── src/
│   ├── app/           # Angular frontend
│   └── server/        # Express backend with aggregators
│       └── aggregators/  # Aggregator implementations to port
```

### Core Models

The application has three main models that form the data hierarchy:

1. **FeedGroup** - Organizes feeds by user
   - Users can create groups to organize their feeds
   - Each group belongs to a user

2. **Feed** - Configuration for content aggregation
   - Specifies aggregator type (full_website, youtube, reddit, etc.)
   - Contains identifier (URL, subreddit, channel ID)
   - Belongs to a user and optionally a group
   - Has daily limit and enabled/disabled status

3. **Article** - Individual content items from feeds
   - Contains raw and processed content
   - Has read/starred status
   - Linked to a feed
   - Includes metadata (author, date, icon)

### Aggregator Types

The system supports multiple aggregator types (defined in `core/choices.py`):

**Custom Aggregators:**
- `full_website` - Generic web scraper (default)
- `feed_content` - RSS/Atom feed parser

**Managed Aggregators (site-specific):**
- `heise`, `merkur`, `tagesschau` - German news sites
- `explosm`, `dark_legacy`, `oglaf` - Web comics
- `caschys_blog`, `mactechnews`, `mein_mmo` - Tech/gaming blogs

**Social Aggregators:**
- `youtube` - YouTube channels
- `reddit` - Reddit subreddits
- `podcast` - Podcast feeds

**Note:** The aggregator implementations are in the legacy codebase (`old/src/server/aggregators/`). They need to be ported to Django.

### Database

- **Database**: SQLite (configured in `yana/settings.py`)
- **ORM**: Django ORM
- **Location**: `db.sqlite3` (git-ignored)

### Migration from TypeScript/Angular

The `old/` directory contains the original implementation with:
- **Frontend**: Angular 21 with SSR
- **Backend**: Express.js with tRPC
- **Database**: SQLite with Drizzle ORM
- **Aggregators**: TypeScript implementations in `old/src/server/aggregators/`

When porting aggregator logic to Django:
1. Review the TypeScript implementation in `old/src/server/aggregators/`
2. The aggregators use a Template Method Pattern with fixed flow
3. See `old/docs/AGGREGATOR_FLOW.md` for architecture details
4. Key dependencies to port: BeautifulSoup4 (already in requirements.txt), requests

## Development Workflow

**⚠️ All development commands require the virtual environment to be activated!**

### Adding a New Model Field

1. Activate virtual environment: `source venv/bin/activate`
2. Modify the model in `core/models.py`
3. Create migration: `python3 manage.py makemigrations`
4. Review generated migration in `core/migrations/`
5. Apply migration: `python3 manage.py migrate`
6. Update admin configuration in `core/admin.py` if needed

### Adding a New Aggregator Type

1. Add new choice to `AGGREGATOR_CHOICES` in `core/choices.py`
2. Create migration for the new choice (if needed)
3. Implement aggregator logic (to be ported from `old/src/server/aggregators/`)
4. Test with sample feed

### Working with the Admin Interface

The Django admin is fully configured with custom list displays, filters, and search:
- **FeedGroup**: View by user, search by name
- **Feed**: View by aggregator type, user, group; search by name/identifier
- **Article**: View by feed, read/starred status; search content

All models use fieldsets for organized editing with collapsible timestamp sections.

## Dependencies

Key Python packages (from `requirements.txt`):
- **Django 6.0** - Web framework
- **graphene-django 3.2.3** - GraphQL support (planned)
- **django-q2 1.9.0** - Task queue for background jobs (planned)
- **requests 2.32.3** - HTTP library for fetching feeds
- **beautifulsoup4 4.12.3** - HTML parsing for content extraction

## Configuration Notes

### Settings (`yana/settings.py`)

- **DEBUG**: Set to `True` for development, must be `False` in production
- **SECRET_KEY**: Change in production (use environment variable)
- **ALLOWED_HOSTS**: Configure for deployment
- **DATABASES**: Currently SQLite; can be changed to PostgreSQL/MySQL for production
- **INSTALLED_APPS**: Includes 'core' app

### URL Configuration (`yana/urls.py`)

Currently only has admin URLs configured. API/frontend URLs will need to be added.

## VSCode Integration

The project includes a VSCode launch configuration (`.vscode/launch.json`) for debugging:
- **Python Debugger: Django** - Launch Django development server with debugger attached
- Set breakpoints in Python files and use F5 to start debugging

## Reference Documentation

The legacy TypeScript implementation has comprehensive documentation in `old/docs/`:
- `TRPC_API.md` - API structure (reference for Django API design)
- `AGGREGATOR_FLOW.md` - Detailed aggregator architecture
- `ESLINT.md` - Code quality patterns (adapt for Python/Django)

## Context: Branch Strategy

This repository uses a git worktree strategy with multiple branches:
- `main` - Primary branch
- `bright-mountain` - Current working branch (this worktree)
- Other worktrees: `clever-beacon`, `happy-beacon`

When committing, ensure you're on the correct branch for your work.
