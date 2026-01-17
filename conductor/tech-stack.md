# Core Stack
- **Language:** Python 3.13 (Managed via `venv`)
- **Web Framework:** Django 6.0
- **Database:** SQLite (Optimized with WAL mode, large cache, and memory-mapped I/O)
- **Background Workers:** django-q2 (ORM broker)

# Content Processing
- **Feed Parsing:** `feedparser`
- **HTML Extraction & Cleaning:** `beautifulsoup4`, `lxml`
- **Markdown Conversion:** `markdown`

# API & Networking
- **HTTP Client:** `requests`
- **Static Assets:** `whitenoise`

# Code Quality & Tooling
- **Linting & Formatting:** `ruff`
- **Type Checking:** `mypy`
- **Import Sorting:** `isort`
- **Process Management:** `supervisor` (for Docker/Production)

# Infrastructure
- **Containerization:** Docker & Docker Compose
- **Web Server:** Gunicorn
