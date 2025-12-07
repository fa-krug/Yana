# Code Quality Validation Hooks

This project uses automatic git hooks to ensure code quality.

## Git Pre-Commit Hook (Auto-Installed)

**Source**: `hooks/pre-commit` (version controlled)
**Target**: `.git/hooks/pre-commit` (auto-installed)

Runs **before every git commit** to validate code quality:
- Runs `ruff check --fix .` (linting with auto-fix)
- Runs `ruff format .` (code formatting)
- Checks and installs dependencies if needed
- Runs `python manage.py test core api social` (test suite)

If any step fails, the commit is blocked. To bypass (not recommended): `git commit --no-verify`

**Automatic Installation:**
The `.claude/hooks/session-start` hook automatically installs/updates this hook from `hooks/pre-commit` when Claude Code sessions start.

## Claude Code Hooks

This directory contains hooks for Claude Code.

### session-start

**Purpose**: Automatically installs/updates the git pre-commit hook when sessions start.

**How it works**:
1. When a Claude Code session starts, this hook runs automatically
2. Checks if `hooks/pre-commit` exists in the repo
3. Copies it to `.git/hooks/pre-commit` and makes it executable
4. Ensures the hook is always up-to-date with the repo version

This means everyone using Claude Code automatically gets the latest pre-commit hook!
