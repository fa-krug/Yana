# Cursor Configuration

This directory contains all configuration, documentation, and tooling for the Yana RSS aggregator project.

## Project Overview

**Yana** is a Node.js/TypeScript-based RSS feed aggregator that fetches **full article content** (not just headlines) using Playwright for browser automation.

### Architecture

- **Backend**: Node.js/TypeScript with Express and tRPC
- **Frontend**: Angular SPA
- **Database**: SQLite with Drizzle ORM
- **Testing**: Vitest with Playwright for integration tests

## Documentation Structure

All detailed documentation is in `.cursor/rules/`:

- **`workflow.mdc`** - Development workflow, commit conventions, and communication guidelines
- **`general.mdc`** - Project overview, architecture, and core concepts
- **`aggregators.mdc`** - Aggregator plugin system and examples
- **`commands.mdc`** - CLI commands reference
- **`typescript.mdc`** - TypeScript best practices and conventions
- **`angular.mdc`** - Angular 21 best practices (standalone components, signals)
- **`frontend.mdc`** - Angular Material best practices and conventions
- **`testing.mdc`** - Testing patterns and examples

## Pre-Commit Validation

Pre-commit validation is handled by `.cursor/hooks/pre-commit.sh` (Cursor hooks) and optionally `hooks/pre-commit` (traditional git hooks). See `.cursor/hooks/README.md` and `hooks/README.md` for details.

The pre-commit hook automatically runs:
1. Prettier formatting check and auto-fix
2. Frontend dependency installation check (if needed)
3. Frontend tests
4. Frontend formatting verification

**Commits are BLOCKED if any step fails.**

### Traditional Git Hooks

If you prefer traditional git hooks instead of Cursor hooks, you can manually install:

```bash
cp hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

## Cursor Hooks

Cursor hooks are configured in `.cursor/hooks.json` and provide:

- **`pre-commit.sh`** - Intercepts git commit commands and runs validation
- **`format-and-fix.sh`** - Automatically formats files after agent edits

See `.cursor/hooks/README.md` for detailed information.

## Custom Commands

Custom Cursor commands are defined in `.cursor/commands/`:

- **`commit-and-push.md`** - Commit and push changes
- **`investigate.md`** - Investigate issues with high confidence
- **`new.md`** - Create and switch to a new git branch

## Development Workflow

### Before Committing

```bash
# 1. Check formatting
npm run format:check

# 2. Run ALL tests
npm test
```

### Quick Validation Command

```bash
npm run format:check && npm test
```

### Commit Message Format

**MANDATORY: Always use Conventional Commits format.**

Format: `<type>[optional scope]: <description>`

Examples:
- `feat(aggregators): add Reddit comment support`
- `fix(core): handle missing RSS feed gracefully`
- `refactor(services): extract feed service logic`
- `test(aggregators): add integration tests`

See `.cursor/rules/workflow.mdc` for complete details.

## Project Structure

```
yana/
├── src/
│   ├── server/              # Node.js/TypeScript backend
│   │   ├── aggregators/     # Aggregator plugins (auto-discovered)
│   │   ├── services/        # Business logic layer
│   │   ├── trpc/            # tRPC API routers
│   │   ├── db/              # Database schema and migrations
│   │   └── scripts/         # Utility scripts
│   └── client/              # Angular frontend
├── .cursor/                 # This directory
│   ├── rules/               # Coding guidelines and patterns
│   ├── hooks/               # Pre-commit validation
│   └── commands/            # Custom Cursor commands
└── package.json             # Node.js dependencies
```

## Key Principles

### SOLID Principles

- **Single Responsibility**: Each class/function has one well-defined purpose
- **Open/Closed**: Extend functionality via inheritance/composition, not modification
- **Liskov Substitution**: Subtypes must be substitutable for base types
- **Interface Segregation**: Prefer focused interfaces
- **Dependency Inversion**: Depend on abstractions

### Fat Services, Thin Routes

Business logic lives in **service classes** (`src/server/services/`), not in routes or controllers.

### File Size Limits

**MANDATORY: Keep files under 500 lines of code (LOC).**

When a file exceeds 500 LOC, refactor by extracting functionality into separate modules/classes.

## Getting Started

1. **Install dependencies**: `npm install`
2. **Install Playwright browsers**: `npx playwright install chromium`
3. **Set up database**: `npm run db:migrate`
4. **Run server**: `npm start`
5. **Run tests**: `npm test`

## Environment Configuration

All settings via environment variables. Key vars:
- `DATABASE_URL`, `NODE_ENV`, `PORT`
- `AGGREGATION_SCHEDULE` (cron format for scheduled tasks)
- `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` (for Reddit integration)

New env vars: add to `.env.example` + README table.

## Additional Resources

- **Git Hooks**: See `hooks/README.md` for git hook documentation
- **Aggregator Guidelines**: See `.cursor/rules/aggregator-guidelines.mdc` for aggregator development
- **API Documentation**: tRPC routers provide type-safe API endpoints
