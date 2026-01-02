# Merkur Aggregator Reimplementation Plan

## Overview
Reimplement the Merkur aggregator from the TypeScript codebase (`old/src/server/aggregators/merkur.ts`) into the Django Python codebase, following the patterns established by `MeinMmoAggregator` and `TagesschauAggregator`.

## Current State
- ✅ Already registered in `core/choices.py` as `("merkur", "Merkur")`
- ✅ Already registered in `core/aggregators/registry.py` (imports from `implementations.py`)
- ❌ Currently a stub in `core/aggregators/implementations.py` (returns empty list)
- ❌ No dedicated directory structure (should follow `mein_mmo/` and `tagesschau/` pattern)

## Implementation Steps

### Step 1: Create Directory Structure
**File:** `core/aggregators/merkur/__init__.py`
- Export `MerkurAggregator` class

**File:** `core/aggregators/merkur/aggregator.py`
- Main aggregator implementation (primary file)

### Step 2: Implement Base Aggregator Class
**File:** `core/aggregators/merkur/aggregator.py`

**Class Structure:**
```python
class MerkurAggregator(FullWebsiteAggregator):
    """Specialized aggregator for Merkur.de (German news)."""
```

**Required Methods/Attributes:**

1. **`__init__` method:**
   - Set default RSS feed identifier if not provided: `"https://www.merkur.de/rssfeed.rdf"`
   - Follow pattern from `MeinMmoAggregator.__init__`

2. **`get_source_url()` method:**
   - Return `"https://www.merkur.de"` for GReader API compatibility
   - Required by `FullWebsiteAggregator` base class

3. **`get_identifier_choices()` classmethod:**
   - Return list of available RSS feed options for autocomplete
   - Returns `List[Tuple[str, str]]` with (URL, Display Name) tuples
   - Include all 18 regional feed options from old implementation (see Step 2.5)
   - Used by Django admin autocomplete for feed identifier selection

4. **`get_default_identifier()` classmethod:**
   - Return default RSS feed: `"https://www.merkur.de/rssfeed.rdf"`
   - Used for autocomplete pre-population and default feed creation
   - Follow pattern from `HeiseAggregator.get_default_identifier()`

5. **Class Attributes:**
   - `content_selector = ".idjs-Story"` (main content container)
   - `selectors_to_remove` - List of CSS selectors to remove (see Step 3)

### Step 2.5: Implement Identifier Choices
**File:** `core/aggregators/merkur/aggregator.py`

**Method:** `get_identifier_choices()` classmethod

**Purpose:** Provide list of available RSS feed options for Django admin autocomplete

**Required Import:**
```python
from typing import List, Tuple
```

**Implementation:**
Return all 18 regional feed options from the old TypeScript implementation:

```python
@classmethod
def get_identifier_choices(cls) -> List[Tuple[str, str]]:
    """Get available Merkur RSS feed choices."""
    return [
        ("https://www.merkur.de/rssfeed.rdf", "Main Feed"),
        ("https://www.merkur.de/lokales/garmisch-partenkirchen/rssfeed.rdf", "Garmisch-Partenkirchen"),
        ("https://www.merkur.de/lokales/wuermtal/rssfeed.rdf", "Würmtal"),
        ("https://www.merkur.de/lokales/starnberg/rssfeed.rdf", "Starnberg"),
        ("https://www.merkur.de/lokales/fuerstenfeldbruck/rssfeed.rdf", "Fürstenfeldbruck"),
        ("https://www.merkur.de/lokales/dachau/rssfeed.rdf", "Dachau"),
        ("https://www.merkur.de/lokales/freising/rssfeed.rdf", "Freising"),
        ("https://www.merkur.de/lokales/erding/rssfeed.rdf", "Erding"),
        ("https://www.merkur.de/lokales/ebersberg/rssfeed.rdf", "Ebersberg"),
        ("https://www.merkur.de/lokales/muenchen/rssfeed.rdf", "München"),
        ("https://www.merkur.de/lokales/muenchen-lk/rssfeed.rdf", "München Landkreis"),
        ("https://www.merkur.de/lokales/holzkirchen/rssfeed.rdf", "Holzkirchen"),
        ("https://www.merkur.de/lokales/miesbach/rssfeed.rdf", "Miesbach"),
        ("https://www.merkur.de/lokales/region-tegernsee/rssfeed.rdf", "Region Tegernsee"),
        ("https://www.merkur.de/lokales/bad-toelz/rssfeed.rdf", "Bad Tölz"),
        ("https://www.merkur.de/lokales/wolfratshausen/rssfeed.rdf", "Wolfratshausen"),
        ("https://www.merkur.de/lokales/weilheim/rssfeed.rdf", "Weilheim"),
        ("https://www.merkur.de/lokales/schongau/rssfeed.rdf", "Schongau"),
    ]
```

**Reference:**
- Old implementation lines 29-63
- `core/aggregators/heise/aggregator.py` lines 29-36 (similar pattern)
- `core/aggregators/tagesschau/aggregator.py` lines 38-43 (similar pattern)
- `core/autocomplete.py` - Uses this method for Django admin autocomplete
- `core/aggregators/base.py` lines 173-190 - Base class definition

### Step 3: Define Selectors to Remove
**Based on old implementation, add these selectors:**
```python
selectors_to_remove = [
    ".id-DonaldBreadcrumb--default",
    ".id-StoryElement-headline",
    ".lp_west_printAction",
    ".lp_west_webshareAction",
    ".id-Recommendation",
    ".enclosure",
    ".id-Story-timestamp",
    ".id-Story-authors",
    ".id-Story-interactionBar",
    ".id-Comments",
    ".id-ClsPrevention",
    "egy-discussion",
    "figcaption",
    "script",
    "style",
    "iframe",
    "noscript",
    "svg",
    ".id-StoryElement-intestitialLink",
    ".id-StoryElement-embed--fanq",
]
```

**Note:** Base `FullWebsiteAggregator` already includes `["script", "style", "iframe", "noscript", ".advertisement", ".ad", ".social-share"]`, but we should explicitly list them for clarity and to match the old implementation exactly.

### Step 4: Override `extract_content()` Method
**Purpose:** Extract content using `.idjs-Story` selector with fallback

**Implementation:**
1. Use `extract_main_content()` from `core/aggregators/utils/content_extractor.py`
2. Pass `selector=".idjs-Story"` and `remove_selectors=self.selectors_to_remove`
3. If extraction returns empty/None, fallback to `super().extract_content(html, article)`
4. Log debug messages for extraction process
5. Return extracted HTML string

**Reference:** Old implementation lines 93-146

### Step 5: Override `process_content()` Method
**Purpose:** Apply Merkur-specific HTML cleanup

**Implementation Steps:**

1. **Remove empty elements:**
   - Use `remove_empty_elements()` from `core/aggregators/utils/html_cleaner.py`
   - Remove empty `p`, `div`, `span` tags that have no text and no images
   - Pass `tags=["p", "div", "span"]`

2. **Sanitize HTML (create data-sanitized-* attributes):**
   - Use `sanitize_class_names()` to convert `class` → `data-sanitized-class`
   - Need to implement full sanitization similar to TypeScript `sanitizeHtml()`:
     - Remove `script`, `object`, `embed` elements
     - Remove `style` and `iframe` elements (except YouTube embeds if needed)
     - Convert `class` → `data-sanitized-class`
     - Convert `style` → `data-sanitized-style` (if not YouTube-related)
     - Convert `id` → `data-sanitized-id`
     - Convert other `data-*` attributes → `data-sanitized-*` (except `data-src`, `data-srcset`)

3. **Remove all data-sanitized-* attributes:**
   - After sanitization, remove all attributes starting with `data-sanitized-*`
   - This is Merkur-specific behavior (legacy cleanup)
   - Use BeautifulSoup to iterate through all elements and remove matching attributes

4. **Call base `process_content()`:**
   - Call `super().process_content(html, article)` for final formatting
   - This handles header image extraction, content formatting, etc.

**Reference:** Old implementation lines 151-221

### Step 6: Create HTML Sanitization Utility (if needed)
**File:** `core/aggregators/utils/html_cleaner.py` (add new function)

**Function:** `sanitize_html_attributes(html: str) -> str`
- Full HTML sanitization that creates `data-sanitized-*` attributes
- Similar to TypeScript `sanitizeHtml()` function
- Returns HTML string with sanitized attributes

**OR** enhance existing `sanitize_class_names()` to handle all attributes:
- Rename to `sanitize_html_attributes()` or create new function
- Handle `class`, `style`, `id`, and other `data-*` attributes
- Keep `data-src` and `data-srcset` unchanged

**Note:** Check if this functionality already exists or needs to be added.

### Step 7: Update Registry
**File:** `core/aggregators/registry.py`

**Changes:**
1. Update import to use new location:
   ```python
   from .merkur import MerkurAggregator
   ```
2. Remove import from `implementations.py`
3. Registry entry already exists, no changes needed

### Step 8: Remove Stub from implementations.py
**File:** `core/aggregators/implementations.py`

**Changes:**
1. Remove `MerkurAggregator` class (lines 133-140)
2. Remove from imports if present

### Step 9: Testing
**Test Command:**
```bash
# Test with default RSS feed
python3 manage.py test_aggregator merkur

# Test with specific feed URL
python3 manage.py test_aggregator merkur "https://www.merkur.de/lokales/muenchen/rssfeed.rdf"

# Test with verbose output
python3 manage.py test_aggregator merkur --verbose --first 2

# Test with dry-run (no database save)
python3 manage.py test_aggregator merkur --dry-run
```

**Test Scenarios:**
1. ✅ Default RSS feed loads and parses correctly
2. ✅ Regional RSS feeds work (e.g., München, Garmisch-Partenkirchen)
3. ✅ `get_identifier_choices()` returns all 18 feed options
4. ✅ Django admin autocomplete shows feed options when aggregator type is selected
5. ✅ Content extraction finds `.idjs-Story` element
6. ✅ Empty elements are removed
7. ✅ Data-sanitized-* attributes are created then removed
8. ✅ Final content is properly formatted with header/footer
9. ✅ Articles are saved to database correctly
10. ✅ Fallback to base extraction if `.idjs-Story` not found

## Key Implementation Details

### RSS Feed URLs
The old implementation supports multiple regional feeds:
- Main: `https://www.merkur.de/rssfeed.rdf`
- Regional: `https://www.merkur.de/lokales/{region}/rssfeed.rdf`

**Identifier Choices:**
- The aggregator provides 18 predefined feed options via `get_identifier_choices()`
- These are used by Django admin autocomplete for easy feed selection
- Users can still enter custom feed URLs if needed (autocomplete supports custom input)
- All 18 regional options from the TypeScript implementation are included

### Content Selector
- **Primary:** `.idjs-Story` (Merkur-specific article container)
- **Fallback:** Base `FullWebsiteAggregator` extraction if primary fails

### HTML Processing Flow
1. Extract content using `.idjs-Story` selector
2. Remove unwanted elements via `selectors_to_remove`
3. Remove empty `p`, `div`, `span` elements
4. Sanitize HTML (create `data-sanitized-*` attributes)
5. Remove all `data-sanitized-*` attributes (Merkur-specific cleanup)
6. Call base `process_content()` for final formatting

### Differences from TypeScript Implementation
1. **No `waitForSelector`:** Django doesn't use Selenium/Playwright, so no need for wait logic
2. **`identifierChoices` → `get_identifier_choices()`:** Implemented as classmethod for Django admin autocomplete integration
3. **BeautifulSoup vs Cheerio:** Use BeautifulSoup methods instead of Cheerio
4. **Synchronous:** Python implementation is synchronous (no async/await)

## Files to Create/Modify

### New Files:
1. `core/aggregators/merkur/__init__.py`
2. `core/aggregators/merkur/aggregator.py`

### Modified Files:
1. `core/aggregators/registry.py` - Update import
2. `core/aggregators/implementations.py` - Remove stub
3. `core/aggregators/utils/html_cleaner.py` - Add/enhance sanitization function (if needed)

## Reference Implementations
- **`core/aggregators/mein_mmo/aggregator.py`** - Full implementation with custom extraction
- **`core/aggregators/tagesschau/aggregator.py`** - Full implementation with custom processing
- **`core/aggregators/heise/aggregator.py`** - Another FullWebsiteAggregator example
- **`old/src/server/aggregators/merkur.ts`** - Original TypeScript implementation

## Estimated Complexity
- **Low-Medium:** Similar complexity to `TagesschauAggregator`
- Main challenge: Implementing the full HTML sanitization flow (sanitize → remove data-sanitized-*)
- Estimated time: 2-3 hours for implementation + testing

## Success Criteria
- ✅ Aggregator successfully fetches articles from Merkur RSS feeds
- ✅ `get_identifier_choices()` returns all 18 regional feed options
- ✅ Django admin autocomplete displays feed options correctly
- ✅ Content is extracted from `.idjs-Story` element
- ✅ Empty elements are removed
- ✅ HTML is properly sanitized and cleaned
- ✅ Articles are saved to database with correct content
- ✅ Test command works with `--verbose` and `--dry-run` flags
- ✅ No linter errors
- ✅ Follows PEP 8 style guidelines
