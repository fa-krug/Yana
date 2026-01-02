# Track Specification: Re-implement Missing Aggregators (Managed & Podcast)

## Overview
This track focuses on porting five key aggregator implementations from the legacy TypeScript codebase (`old/src/server/aggregators/`) to the new Python/Django environment. The goal is to replace the current stub implementations in `core/aggregators/implementations.py` with fully functional, native Python versions that follow the project's established patterns.

## Target Aggregators
1.  **Explosm (Cyanide & Happiness):** Port custom scraping logic to extract comic images from the `#comic` element.
2.  **Dark Legacy Comics:** Port custom scraping logic to extract comic images.
3.  **Caschy's Blog:** Implement full-content extraction for this popular German tech blog.
4.  **MacTechNews:** Implement full-content extraction for this Apple-centric news site.
5.  **Podcast:** Implement specialized RSS parsing for podcast feeds, including audio enclosure handling, iTunes metadata extraction (duration, artwork), and embedded audio players.

## Functional Requirements
- **Native Implementation:** Each aggregator must be implemented as a specialized class inheriting from either `FullWebsiteAggregator` (for news/comics) or `RssAggregator` (for Podcasts).
- **Explosm/Dark Legacy:**
    - Must correctly identify and extract the primary comic image.
    - Should remove noise like ads, navigation containers, and metadata around the comic.
- **Caschy's Blog/MacTechNews:**
    - Must extract the primary article body while removing site-specific clutter (sidebars, comments, social sharing).
- **Podcast:**
    - **Audio Enclosures:** MUST extract the `enclosure` URL and type for the primary audio file (MP3/M4A).
    - **Embedded Player:** The processed content should include a native `<audio>` tag with controls.
    - **Metadata:** Capture and format duration (e.g., "HH:MM:SS") and episode artwork if available in the feed.
    - **No Fetching:** Like the legacy version, the Podcast aggregator should rely solely on the RSS feed and not attempt to fetch/scrape individual episode pages.

## Non-Functional Requirements
- **Performance:** Use `BeautifulSoup` with the `lxml` parser for efficient HTML processing.
- **Maintainability:** Adhere to PEP 8 and the project's established style (120 char lines, double quotes, f-strings).
- **Error Handling:** Gracefully handle missing elements or malformed feeds by falling back to base implementation defaults.

## Acceptance Criteria
- [ ] New aggregator classes are created in `core/aggregators/` (or specific subdirectories if needed).
- [ ] `core/aggregators/registry.py` is updated to point to the new native implementations.
- [ ] `core/aggregators/implementations.py` is cleaned of the ported stubs.
- [ ] Ported aggregators pass validation using the `test_aggregator` management command.
- [ ] Podcast articles correctly display an audio player and download link in a GReader-compatible format.
- [ ] Comic articles show the image directly as the primary content.

## Out of Scope
- Re-implementing other aggregators like `Heise`, `Merkur`, or `Tagesschau` (unless strictly necessary for shared utilities).
- Implementing multi-page article handling for these specific aggregators (except if Caschy's Blog or MacTechNews requires it for base functionality).
- UI changes to the Django Admin or frontend beyond standard article content rendering.
