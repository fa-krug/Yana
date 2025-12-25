# ESLint Errors Fix Plan
## Comprehensive Step-by-Step Refactoring Guide

**Total Errors: ~40 (down from 148)**
**Last Updated:** Dec 25, 2025

---

## Progress Tracking

**Overall Progress:** Major milestones reached. Core processing logic refactored.

- [x] **Phase 1:** Quick Wins (Completed/Verified)
- [x] **Phase 2:** Deprecations (Completed/Verified)
- [x] **Phase 3:** Regex Security (Completed/Verified)
- [x] **Phase 4:** Design Patterns (Completed)
- [x] **Phase 5:** Low Complexity (Mostly Completed)
    - [x] `errorHandler.ts`
    - [x] `sessionStore.ts`
    - [x] `heise.ts`
    - [x] `youtube/content.ts`
    - [x] `reddit/images.ts`
    - [x] `podcast.ts`
- [ ] **Phase 6:** Medium Complexity (0 / 25 errors)
- [ ] **Phase 7:** High Complexity (1 / 2 errors)
    - [x] `src/server/aggregators/base/process.ts` (Refactored from 212 to < 15!)
    - [ ] `src/server/aggregators/tagesschau.ts` (Next Target)
- [ ] **Phase 8:** Frontend Services (0 / 2 errors)

---

## Remaining Focus Areas (Cognitive Complexity)

### High Priority Targets (Complexity > 100)
1. **`src/server/aggregators/tagesschau.ts`** - 161 complexity (critical!)

### Medium Priority Targets (Complexity > 50)
1. `src/server/aggregators/reddit/content.ts` - 90 complexity
2. `src/server/aggregators/base/utils/images/strategies/svg.ts` - 80 complexity
3. `src/server/aggregators/youtube/channel.ts` - 62 complexity

---

## Completed Tasks History

### Phase 5 & 7: Complexity Reductions
- **Fixed:** `src/server/aggregators/base/process.ts` - Major refactor split monolithic `standardizeContentFormat` into 10+ focused helper functions. Reduced complexity from 212 to below 15.
- **Fixed:** `src/server/aggregators/reddit/images.ts` - Extracted priority check logic and split extraction methods.
- **Fixed:** `src/server/aggregators/podcast.ts` - Split parsing logic and extracted property helpers.
- **Fixed:** `src/server/aggregators/heise.ts` - Extracted comment processing and element finding logic.
- **Fixed:** `src/server/middleware/errorHandler.ts` & `sessionStore.ts` - Extracted logging, response building, and sanitization logic.

---

## Next Action Item
Start refactoring **`src/server/aggregators/tagesschau.ts`** to reduce its 161 cognitive complexity.
