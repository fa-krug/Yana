# ESLint Errors Fix Plan
## Comprehensive Step-by-Step Refactoring Guide

**Total Errors: ~70 (down from 148)**
**Last Updated:** Dec 25, 2025

---

## Progress Tracking

**Overall Progress:** Significant progress made. Phases 1-4 are largely complete.

- [x] **Phase 1:** Quick Wins (Completed/Verified)
- [x] **Phase 2:** Deprecations (Completed/Verified)
- [x] **Phase 3:** Regex Security (Completed/Verified)
- [x] **Phase 4:** Design Patterns (Completed)
- [ ] **Phase 5:** Low Complexity (0 / 15 errors) - 4-6 hours
- [ ] **Phase 6:** Medium Complexity (0 / 25 errors) - 8-12 hours
- [ ] **Phase 7:** High Complexity (0 / 27 errors) - 12-20 hours
- [ ] **Phase 8:** Frontend Services (0 / 2 errors) - 3-4 hours

---

## Remaining Focus Areas (Cognitive Complexity)

The majority of remaining errors are **Cognitive Complexity** issues. These are harder to fix and require careful refactoring.

### High Priority Targets (Complexity > 100)
1. **`src/server/aggregators/base/process.ts`** - 212 complexity (critical!)
2. **`src/server/aggregators/tagesschau.ts`** - 161 complexity (critical!)

### Medium Priority Targets (Complexity > 50)
1. `src/server/aggregators/reddit/content.ts` - 90 complexity
2. `src/server/aggregators/base/utils/images/strategies/svg.ts` - 80 complexity
3. `src/server/aggregators/youtube/channel.ts` - 62 complexity

---

## Phase 5: Low Complexity (16-20)
**Next Steps:**

Functions with complexity between 16 and 20. These should be relatively easy to refactor by extracting methods or simplifying conditionals.

**Files:**
- [ ] `src/server/middleware/errorHandler.ts`
- [ ] `src/server/middleware/sessionStore.ts`
- [ ] `src/server/aggregators/heise.ts`
- [ ] `src/server/aggregators/youtube/content.ts`
- [ ] `src/server/aggregators/reddit/images.ts`
- [ ] `src/server/aggregators/podcast.ts`

---

## Phase 6 & 7: Medium to High Complexity

See original plan for detailed breakdown. These require splitting large functions into classes or service methods.

---

## Completed Tasks History

### Phase 1: Quick Wins
- Verified unused variables were removed.
- Verified nested ternaries were resolved.

### Phase 2: Deprecations
- `sqliteTable` deprecations in `src/server/db/schema.ts` were verified as resolved.

### Phase 3: Regex Security
- Reviewed and verified regex issues. One minor duplicate character class warning remains in `src/server/aggregators/reddit/markdown.ts`.

### Phase 4: Design Patterns
- **Fixed:** `no-selector-parameter` in `src/server/aggregators/__tests__/options-helpers.ts` by splitting `checkHasHeader`/`checkHasFooter` into specific expect functions.
- **Fixed:** `no-nested-functions` in `src/server/aggregators/__tests__/aggregator-options.test.ts` by moving mock helpers to module level and using `for` loops instead of `Array.from` with callbacks.

---

## Next Action Item
Start **Phase 5**, targeting `src/server/middleware/errorHandler.ts` or `src/server/aggregators/base/process.ts` (if tackling high priority first).