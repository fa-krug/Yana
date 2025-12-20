# Test Coverage Gap: Daily Limit Enforcement

## Problem

The daily post limit enforcement bug was not caught by tests because:

## Root Causes

### 1. **Tests Mock `filterArticles` Completely**

In `src/server/aggregators/__tests__/aggregator.test.ts`:
- Line 110: `vi.spyOn(aggregator as any, "filterArticles").mockResolvedValue([...])`
- Line 165: `vi.spyOn(aggregator as any, "filterArticles").mockImplementation(...)`
- Line 360: `vi.spyOn(aggregator as any, "filterArticles").mockResolvedValue([...])`

**Impact**: Tests bypass the actual filtering logic, including `applyArticleLimit()`, so the daily limit enforcement is never tested.

### 2. **No Tests for `applyArticleLimit` Method**

There are no tests that:
- Verify articles are limited when they exceed the daily quota
- Verify empty array is returned when quota is exhausted
- Check that the limit is enforced based on posts already added today
- Test the interaction between `getDynamicFetchLimit()` and `applyArticleLimit()`

### 3. **No Integration Tests for Daily Limit Flow**

The tests don't verify the complete flow:
1. `getDynamicFetchLimit()` calculates fetch limit based on posts added today
2. Articles are fetched and filtered
3. `applyArticleLimit()` enforces the limit after filtering
4. Only articles within the remaining quota are saved

### 4. **Tests Set `dailyPostLimit` But Don't Verify It**

In test fixtures:
- `dailyPostLimit: 10` is set in mock feeds
- But tests never verify that this limit is actually enforced
- Tests don't check that articles are limited to 10 or fewer

## What Should Be Tested

### Unit Tests for `applyArticleLimit`

```typescript
describe("applyArticleLimit", () => {
  it("should return all articles when quota is not exceeded", async () => {
    // Setup: 5 posts today, limit 10, 3 articles
    // Expected: all 3 articles returned
  });

  it("should limit articles to remaining quota", async () => {
    // Setup: 8 posts today, limit 10, 5 articles
    // Expected: only 2 articles returned (10 - 8 = 2 remaining)
  });

  it("should return empty array when quota is exhausted", async () => {
    // Setup: 10 posts today, limit 10, 3 articles
    // Expected: empty array returned
  });

  it("should not limit when dailyPostLimit is -1 (unlimited)", async () => {
    // Setup: dailyPostLimit = -1
    // Expected: all articles returned
  });

  it("should not limit when dailyPostLimit is 0 (disabled)", async () => {
    // Setup: dailyPostLimit = 0
    // Expected: all articles returned
  });
});
```

### Integration Tests for Daily Limit Flow

```typescript
describe("Daily Limit Integration", () => {
  it("should enforce daily limit after filtering", async () => {
    // Setup: Create feed with limit 5, add 3 posts today
    // Fetch 10 articles, filter down to 8 valid articles
    // Expected: Only 2 articles saved (5 - 3 = 2 remaining)
  });

  it("should respect daily limit across multiple aggregation runs", async () => {
    // Setup: Limit 10, first run adds 5 posts
    // Second run fetches 10 articles
    // Expected: Only 5 articles saved (10 - 5 = 5 remaining)
  });
});
```

## Recommendations

1. **Add unit tests for `applyArticleLimit`** - Test all edge cases
2. **Add integration tests** - Test the complete flow with real database queries
3. **Don't mock `filterArticles` in integration tests** - Let the real filtering logic run
4. **Test with actual database state** - Create articles in the database and verify limit enforcement
5. **Test Reddit aggregator specifically** - Since it was the reported issue

## Files to Update

- `src/server/aggregators/__tests__/aggregator.test.ts` - Add `applyArticleLimit` tests
- `src/server/aggregators/__tests__/aggregator-integration.test.ts` - Add daily limit integration tests
- Consider creating `src/server/aggregators/__tests__/daily-limit.test.ts` - Dedicated test file
