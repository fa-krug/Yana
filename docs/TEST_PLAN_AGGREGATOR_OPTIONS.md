# Test Plan: Aggregator and Feed Options Integration Tests

## Goal

Ensure all aggregator options and feed-level options are properly applied during aggregation and not overwritten. Test the complete aggregation flow end-to-end to verify options persist through all stages.

## Current State Analysis

### Aggregators with Options

1. **FullWebsiteAggregator** (base for many)
   - `exclude_selectors` (string, textarea)
   - `ignore_title_contains` (string, textarea)
   - `ignore_content_contains` (string, textarea)
   - `regex_replacements` (string, textarea)

2. **RedditAggregator**
   - `sort_by` (choice: hot, new, top, rising)
   - `comment_limit` (integer, 0-50)
   - `min_comments` (integer, -1 to disable)

3. **YouTubeAggregator**
   - `comment_limit` (integer, 0-50)

4. **MacTechNewsAggregator**
   - `max_comments` (integer, 0-100)

5. **HeiseAggregator** (extends FullWebsiteAggregator)
   - Inherits FullWebsiteAggregator options
   - `max_comments` (integer, 0-100)

6. **MeinMmoAggregator** (extends FullWebsiteAggregator)
   - Inherits FullWebsiteAggregator options
   - `traverse_multipage` (boolean)

7. **Other aggregators** (Merkur, Tagesschau, Explosm, etc.)
   - No custom options (use defaults)

### Feed-Level Options

1. **Content Processing**
   - `generateTitleImage` (boolean) - Extract header image
   - `addSourceFooter` (boolean) - Add source link footer
   - `useCurrentTimestamp` (boolean) - Use current time vs RSS date

2. **Filtering**
   - `skipDuplicates` (boolean) - Skip duplicate articles

3. **Limits**
   - `dailyPostLimit` (integer) - Daily post limit

4. **AI Features** (out of scope for this test plan)
   - `aiTranslateTo`, `aiSummarize`, `aiCustomPrompt`

## Test Strategy

### Approach: Matrix Testing with Shared Fixtures

Instead of testing every option for every aggregator separately (which would create massive duplication), we'll:

1. **Group by Option Type**: Test each option type once per aggregator that supports it
2. **Use Parameterized Tests**: Test multiple values in a single test
3. **Verify End-to-End**: Run full aggregation and check final article content/state
4. **Shared Test Infrastructure**: Reusable helpers for common scenarios

### Test Categories

#### Category 1: Aggregator-Specific Options

**Test Pattern**: For each aggregator with options, test that:
- Option value is read correctly from feed.aggregatorOptions
- Option is applied during aggregation
- Option persists through all aggregation stages
- Final article reflects the option setting

**Aggregators to Test**:
- FullWebsiteAggregator (all 4 options)
- RedditAggregator (all 3 options)
- YouTubeAggregator (1 option)
- MacTechNewsAggregator (1 option)
- HeiseAggregator (inherited + max_comments)
- MeinMmoAggregator (inherited + traverse_multipage)

#### Category 2: Feed-Level Options

**Test Pattern**: Test each feed option across representative aggregators:
- `generateTitleImage`: Test with FullWebsiteAggregator, RedditAggregator
- `addSourceFooter`: Test with FullWebsiteAggregator, RedditAggregator
- `useCurrentTimestamp`: Test with all aggregator types
- `skipDuplicates`: Test with all aggregator types
- `dailyPostLimit`: Already tested separately

**Representative Aggregators**:
- FullWebsiteAggregator (custom, most options)
- RedditAggregator (social, API-based)
- FeedContentAggregator (RSS-only, simplest)

#### Category 3: Option Interaction

**Test Pattern**: Test that options don't interfere with each other:
- Multiple aggregator options together
- Aggregator options + feed options
- Edge cases (all options enabled/disabled)

#### Category 4: Option Override Prevention

**Test Pattern**: Verify options aren't overwritten:
- Options persist through fetch → parse → filter → enrich → finalize
- Options aren't reset to defaults
- Options aren't lost during error handling

## Detailed Test Cases

### FullWebsiteAggregator Options

#### Test: `exclude_selectors`
```typescript
it("should remove elements matching exclude_selectors", async () => {
  // Setup: Feed with exclude_selectors: ".ad, .social-share"
  // Mock HTML with <div class="ad"> and <div class="social-share">
  // Run aggregation
  // Verify: Final article content doesn't contain .ad or .social-share elements
});
```

#### Test: `ignore_title_contains`
```typescript
it("should skip articles with titles matching ignore_title_contains", async () => {
  // Setup: Feed with ignore_title_contains: "[SPONSORED]"
  // Mock feed with article titled "[SPONSORED] Test Article"
  // Run aggregation
  // Verify: Article is not saved (skipped during filtering)
});
```

#### Test: `ignore_content_contains`
```typescript
it("should skip articles with content matching ignore_content_contains", async () => {
  // Setup: Feed with ignore_content_contains: "paywall"
  // Mock article with "paywall" in content
  // Run aggregation
  // Verify: Article is not saved
});
```

#### Test: `regex_replacements`
```typescript
it("should apply regex_replacements to content", async () => {
  // Setup: Feed with regex_replacements: "old-text|new-text"
  // Mock article with "old-text" in content
  // Run aggregation
  // Verify: Final article content contains "new-text" instead of "old-text"
});
```

### RedditAggregator Options

#### Test: `sort_by`
```typescript
it("should fetch posts sorted by sort_by option", async () => {
  // Setup: Feed with sort_by: "new"
  // Mock Reddit API to verify sort parameter
  // Run aggregation
  // Verify: API called with correct sort parameter
});
```

#### Test: `comment_limit`
```typescript
it("should fetch specified number of comments per post", async () => {
  // Setup: Feed with comment_limit: 5
  // Mock Reddit API with 10 comments available
  // Run aggregation
  // Verify: Final article content contains exactly 5 comments
});
```

#### Test: `min_comments`
```typescript
it("should skip posts with fewer than min_comments", async () => {
  // Setup: Feed with min_comments: 10
  // Mock post with 5 comments
  // Run aggregation
  // Verify: Post is skipped (not saved)
});
```

### Feed-Level Options

#### Test: `generateTitleImage`
```typescript
it("should extract header image when generateTitleImage=true", async () => {
  // Setup: Feed with generateTitleImage: true
  // Mock article with image in content
  // Run aggregation
  // Verify: Final article has <header> with image
});

it("should not extract header image when generateTitleImage=false", async () => {
  // Setup: Feed with generateTitleImage: false
  // Run aggregation
  // Verify: Final article has no <header> tag
});
```

#### Test: `addSourceFooter`
```typescript
it("should add source footer when addSourceFooter=true", async () => {
  // Setup: Feed with addSourceFooter: true
  // Run aggregation
  // Verify: Final article has <footer> with source link
});

it("should not add source footer when addSourceFooter=false", async () => {
  // Setup: Feed with addSourceFooter: false
  // Run aggregation
  // Verify: Final article has no <footer> tag
});
```

#### Test: `useCurrentTimestamp`
```typescript
it("should use current timestamp when useCurrentTimestamp=true", async () => {
  // Setup: Feed with useCurrentTimestamp: true, article with published date
  // Run aggregation
  // Verify: Saved article.date is current time (not published date)
});

it("should use published date when useCurrentTimestamp=false", async () => {
  // Setup: Feed with useCurrentTimestamp: false
  // Run aggregation
  // Verify: Saved article.date matches article.published
});
```

#### Test: `skipDuplicates`
```typescript
it("should skip duplicate articles when skipDuplicates=true", async () => {
  // Setup: Feed with skipDuplicates: true, existing article with same URL
  // Run aggregation
  // Verify: Duplicate article is not saved
});
```

## Test Implementation Plan

### Phase 1: Infrastructure (Foundation)
1. Create shared test helpers:
   - `createFeedWithOptions()` - Helper to create feed with specific options
   - `runFullAggregation()` - Helper to run complete aggregation flow
   - `verifyArticleContent()` - Helper to verify article content matches options
   - `verifyArticleMetadata()` - Helper to verify article metadata (date, etc.)

### Phase 2: Aggregator Options Tests
1. FullWebsiteAggregator options (4 tests)
2. RedditAggregator options (3 tests)
3. YouTubeAggregator options (1 test)
4. MacTechNewsAggregator options (1 test)
5. HeiseAggregator options (1 test - max_comments)
6. MeinMmoAggregator options (1 test - traverse_multipage)

**Total: ~11 tests for aggregator options**

### Phase 3: Feed Options Tests
1. generateTitleImage (2 tests: true/false)
2. addSourceFooter (2 tests: true/false)
3. useCurrentTimestamp (2 tests: true/false)
4. skipDuplicates (1 test: true case, false is default behavior)

**Total: ~7 tests for feed options**

### Phase 4: Integration Tests
1. Multiple options together (2-3 tests)
2. Option persistence through stages (1 test)
3. Error handling with options (1 test)

**Total: ~4-5 integration tests**

### Total Test Count: ~22-23 tests

## Questions Before Implementation

1. **Test Scope**: Should we test all 14 aggregators, or focus on the 6-7 that have options? 
   - Recommendation: Focus on aggregators with options + 2-3 representative ones without options

2. **Mocking Strategy**: For aggregators that require API calls (Reddit, YouTube), should we:
   - Use full mocks (current approach)
   - Use fixture data (current approach)
   - Both?

3. **Test Granularity**: Should each option value be a separate test, or use parameterized tests?
   - Recommendation: Parameterized tests for boolean/choice options, separate tests for complex options

4. **Content Verification**: How detailed should content verification be?
   - Recommendation: Check for presence/absence of expected elements, not full HTML comparison

5. **Performance**: Should we run all tests in parallel or sequentially?
   - Recommendation: Parallel (vitest default), but ensure database isolation

6. **Edge Cases**: Should we test:
   - Invalid option values?
   - Missing options (should use defaults)?
   - Option conflicts?
   - Recommendation: Yes, but as separate edge case tests

7. **Test Data**: Should we use:
   - Real HTML fixtures (current approach)
   - Generated mock HTML
   - Both?
   - Recommendation: Use existing fixtures where possible, generate mocks for option-specific scenarios

## Implementation Notes

- Use existing test infrastructure (`setupTestDb`, `teardownTestDb`)
- Leverage existing fixtures where possible
- Create new fixtures only for option-specific scenarios
- Ensure tests are independent and can run in any order
- Use descriptive test names that indicate which option is being tested
- Group related tests using `describe` blocks

## Success Criteria

Tests pass when:
1. All aggregator options are correctly applied
2. All feed options are correctly applied
3. Options persist through all aggregation stages
4. Final articles reflect all option settings
5. No options are overwritten or lost
6. Options work correctly in combination
