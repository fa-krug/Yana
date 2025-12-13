# Aggregator Test Fixtures

This directory contains HTML fixtures used for aggregator integration tests.

## Usage

The fixtures are automatically loaded by the integration tests in `aggregator-integration.test.ts`.

## Updating Fixtures

To download or update HTML fixtures, run:

```bash
npx tsx src/server/aggregators/__tests__/download-fixtures.ts
```

This script will:
- Download HTML from test URLs for each aggregator
- Save one HTML file per aggregator (e.g., `heise.html`, `merkur.html`)
- Skip aggregators that require authentication or have unstable URLs

## File Naming

Fixtures are named using the aggregator ID:
- `heise.html` - Heise aggregator
- `merkur.html` - Merkur aggregator
- `tagesschau.html` - Tagesschau aggregator
- etc.

## Notes

- Fixtures should be committed to the repository so tests can run without network access
- If a fixture is missing, tests will fail with a helpful error message
- Fixtures are downloaded once and reused for all test runs
