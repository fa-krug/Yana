# Phase 8: Image Processing & Content Processing Refactoring
## Implementation Guide

This document provides a detailed implementation roadmap for Phase 8 of the refactoring project, focusing on the two highest-priority violations in the aggregator base modules.

---

## Target Functions

### 1. Image Extraction Pipeline
- **File**: `src/server/aggregators/base/utils/images/extract.ts`
- **Function**: `extractImageFromUrl()` at line 24
- **Current Complexity**: 43
- **Target Complexity**: ~15-18
- **Current Lines**: ~170 lines
- **Target Lines**: ~60-80 lines (with extracted helpers)

### 2. HTML Sanitization
- **File**: `src/server/aggregators/base/utils/html.ts`
- **Function**: `sanitizeHtml()` at line 80
- **Current Complexity**: 36
- **Target Complexity**: ~15-18
- **Current Lines**: ~100 lines
- **Target Lines**: ~40-50 lines (with extracted helpers)

---

## Refactoring Plan: Image Extraction (extractImageFromUrl)

### Current Structure Analysis
The function implements a strategy chain:
1. Direct image file detection (.jpg, .png, etc.)
2. YouTube thumbnail extraction
3. Twitter image extraction
4. Meta tag extraction (og:image, twitter:image)
5. Page content scraping (SVG, page images)

With error handling for Playwright and HTTP errors.

### Refactoring Strategy: Strategy Pattern + Error Handler Pattern

#### Step 1: Create Image Strategy Interface
```typescript
// src/server/aggregators/base/utils/images/strategies/interface.ts
export interface ImageStrategy {
  canHandle(url: string): boolean;
  extract(context: ImageExtractionContext): Promise<string | null>;
}

export interface ImageExtractionContext {
  url: string;
  browser?: Browser;
  timeout?: number;
}
```

#### Step 2: Extract Strategy Implementations
```typescript
// src/server/aggregators/base/utils/images/strategies/direct.ts
export class DirectImageStrategy implements ImageStrategy {
  canHandle(url: string): boolean {
    return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(url);
  }

  async extract(): Promise<string | null> {
    // Return the URL directly - it's already an image
    return url;
  }
}

// src/server/aggregators/base/utils/images/strategies/youtube.ts
export class YouTubeStrategy implements ImageStrategy {
  canHandle(url: string): boolean {
    return /youtube\.com|youtu\.be/.test(url);
  }

  async extract(context: ImageExtractionContext): Promise<string | null> {
    // Extract YouTube thumbnail using existing handler
    return await handleYoutubeThumbnail(context.url);
  }
}

// Similar for TwitterStrategy, MetaTagStrategy, PageStrategy
```

#### Step 3: Create Strategy Orchestrator
```typescript
// src/server/aggregators/base/utils/images/extraction-orchestrator.ts
export class ImageExtractionOrchestrator {
  private strategies: ImageStrategy[];

  async extractFromUrl(
    url: string,
    context: ImageExtractionContext,
  ): Promise<string | null> {
    for (const strategy of this.strategies) {
      if (!strategy.canHandle(url)) continue;

      try {
        const image = await strategy.extract(context);
        if (image) return image;
      } catch (error) {
        if (isArticleSkipError(error)) throw error;
        // Continue to next strategy
      }
    }
    return null;
  }
}
```

#### Step 4: Extract Error Handling
```typescript
// src/server/aggregators/base/utils/images/playwright-error-handler.ts
export function extractHttpStatusFromPlaywrightError(
  error: unknown,
): number | null {
  // Extract status from error message via regex
  // Returns 400-599 or null if not found
}

export function isPlaywrightHttpError(error: unknown): boolean {
  const status = extractHttpStatusFromPlaywrightError(error);
  return status ? status >= 400 && status < 500 : false;
}
```

#### Step 5: Simplify Main Function
```typescript
export async function extractImageFromUrl(
  url: string,
  options?: ExtractImageOptions,
): Promise<string | null> {
  let browser: Browser | undefined;

  try {
    const context: ImageExtractionContext = {
      url,
      browser,
      timeout: options?.timeout,
    };

    // Use orchestrator with all strategies
    const orchestrator = new ImageExtractionOrchestrator();
    return await orchestrator.extractFromUrl(url, context);
  } catch (error) {
    if (isArticleSkipError(error)) throw error;
    throw error;
  } finally {
    await browser?.close();
  }
}
```

---

## Refactoring Plan: HTML Sanitization (sanitizeHtml)

### Current Structure Analysis
The function:
1. Removes script tags
2. Conditionally preserves YouTube style tags
3. Handles iframes (preserving YouTube proxies)
4. Processes ALL elements to sanitize attributes
5. Special handling for class, style, id, and data attributes

### Refactoring Strategy: Attribute Handler Pattern + YouTube Detection

#### Step 1: Create YouTube Detection Helper
```typescript
// src/server/aggregators/base/utils/html/youtube-detector.ts
export function isYouTubeElement($el: Cheerio<Element>): boolean {
  return (
    $el.hasClass("youtube-embed-container") ||
    $el.closest(".youtube-embed-container").length > 0 ||
    ($el.attr("src")?.includes("/api/youtube-proxy") ?? false)
  );
}

export function isYouTubeStyle($el: Cheerio<Element>): boolean {
  return (
    ($el.attr("src")?.includes("/api/youtube-proxy") ?? false) ||
    $el.closest(".youtube-embed-container").length > 0
  );
}
```

#### Step 2: Extract Attribute Sanitizers
```typescript
// src/server/aggregators/base/utils/html/attribute-sanitizers.ts
export class AttributeSanitizer {
  sanitizeClass($: CheerioAPI, $el: Cheerio<Element>): void {
    const classes = $el.attr("class");
    if (classes?.includes("youtube-embed-container")) return;
    $el.attr("data-sanitized-class", classes);
    $el.removeAttr("class");
  }

  sanitizeStyle($: CheerioAPI, $el: Cheerio<Element>): void {
    if (isYouTubeStyle($el)) return;
    const style = $el.attr("style");
    if (style) {
      $el.attr("data-sanitized-style", style);
      $el.removeAttr("style");
    }
  }

  sanitizeId($: CheerioAPI, $el: Cheerio<Element>): void {
    const id = $el.attr("id");
    if (id) {
      $el.attr("data-sanitized-id", id);
      $el.removeAttr("id");
    }
  }

  sanitizeDataAttributes($: CheerioAPI, $el: Cheerio<Element>): void {
    const attrs = $el[0]?.attribs || {};
    for (const [key, value] of Object.entries(attrs)) {
      if (this.shouldSanitizeDataAttr(key)) {
        $el.attr(`data-sanitized-${key}`, value);
        $el.removeAttr(key);
      }
    }
  }

  private shouldSanitizeDataAttr(name: string): boolean {
    return (
      name.startsWith("data-") &&
      !["data-src", "data-srcset"].includes(name) &&
      !name.startsWith("data-sanitized-")
    );
  }
}
```

#### Step 3: Extract Element Handlers
```typescript
// src/server/aggregators/base/utils/html/element-handlers.ts
export class ElementHandler {
  removeScriptTags($: CheerioAPI): void {
    $("script").remove();
  }

  handleStyleTags($: CheerioAPI): void {
    $("style").each((_, el) => {
      const $el = $(el);
      if (!$el.closest(".youtube-embed-container").length) {
        $el.remove();
      }
    });
  }

  handleIframes($: CheerioAPI): void {
    $("iframe").each((_, el) => {
      const $el = $(el);
      const src = $el.attr("src");

      if (!isYouTubeElement($el)) {
        $el.remove();
      }
    });
  }

  sanitizeAllElements($: CheerioAPI, sanitizer: AttributeSanitizer): void {
    $("*").each((_, el) => {
      const $el = $(el);

      sanitizer.sanitizeClass($, $el);
      sanitizer.sanitizeStyle($, $el);
      sanitizer.sanitizeId($, $el);
      sanitizer.sanitizeDataAttributes($, $el);
    });
  }
}
```

#### Step 4: Simplify Main Function
```typescript
export function sanitizeHtml(
  html: string,
  options?: SanitizeOptions,
): string {
  const $ = cheerio.load(html);
  const handler = new ElementHandler();
  const sanitizer = new AttributeSanitizer();

  // Execute in order
  handler.removeScriptTags($);
  handler.handleStyleTags($);
  handler.handleIframes($);
  handler.sanitizeAllElements($, sanitizer);

  return $.html();
}
```

---

## Implementation Checklist

### Phase 8a: Image Extraction Refactoring
- [ ] Create `ImageStrategy` interface
- [ ] Create `DirectImageStrategy` class
- [ ] Extract YouTube strategy to `YouTubeStrategy`
- [ ] Extract Twitter strategy to `TwitterStrategy`
- [ ] Create `MetaTagStrategy` class
- [ ] Create `PageContentStrategy` class
- [ ] Extract Playwright error handling to `playwright-error-handler.ts`
- [ ] Create `ImageExtractionOrchestrator` class
- [ ] Refactor `extractImageFromUrl()` to use orchestrator
- [ ] Update tests for strategy classes
- [ ] Verify complexity reduction and test passing

### Phase 8b: HTML Sanitization Refactoring
- [ ] Create `youtube-detector.ts` with helper functions
- [ ] Create `AttributeSanitizer` class
- [ ] Create `ElementHandler` class
- [ ] Refactor `sanitizeHtml()` to use handlers
- [ ] Update tests for sanitizer classes
- [ ] Verify complexity reduction and test passing

### Phase 8c: Validation & Documentation
- [ ] Run full test suite - verify 106 tests passing
- [ ] Run ESLint - verify complexity violations reduced
- [ ] Update REFACTORING_LOG.md with Phase 8 results
- [ ] Commit changes with clear message

---

## Expected Results

### Complexity Reduction
- Image extraction: 43 → ~16 (63% reduction)
- HTML sanitization: 36 → ~16 (56% reduction)
- **Total violations**: 41 → 37 (-4)

### Code Organization
- **New modules created**: 10-12 focused classes/functions
- **Lines of code**: ~300 new organized code
- **Lines removed**: ~80-100 lines of complex nested logic

### Quality Metrics
- Tests passing: 106/106 ✓
- Zero regressions: ✓
- Backward compatibility: ✓ (no API changes)

---

## Design Patterns Applied

1. **Strategy Pattern** (Image extraction)
   - Each image source (direct, YouTube, Twitter, meta, page) is a strategy
   - Orchestrator composes them with early return on success
   - Easy to add new strategies

2. **Handler Pattern** (HTML sanitization)
   - ElementHandler for tag-specific logic
   - AttributeSanitizer for attribute processing
   - Clear separation of concerns

3. **Builder/Detector Pattern** (YouTube elements)
   - Centralized YouTube detection avoids duplication
   - Reusable across sanitizers

---

## Notes for Implementation

1. **Test Coverage**: Each strategy should have unit tests
2. **Error Handling**: Preserve article skip logic with specific errors
3. **Performance**: Orchestrator pattern has minimal overhead
4. **Extensibility**: Adding new image sources requires only new strategy class
5. **Documentation**: Add JSDoc comments to strategy interface methods

---

## Timeline Estimate

- **Analysis**: 30 minutes (already done)
- **Implementation**: 2-3 hours
- **Testing**: 1 hour
- **Documentation & Commit**: 30 minutes
- **Total**: ~4-5 hours of development

---

## Rollback Plan

If issues arise:
1. Original functions remain unchanged until full refactoring is complete
2. New strategies can be disabled individually
3. Switch back to old implementations if critical bugs found
4. Git commits allow easy revert by specific feature

---

This guide provides a clear, step-by-step path to reduce complexity while maintaining code quality and testability. Each section can be implemented independently and tested before moving to the next.
