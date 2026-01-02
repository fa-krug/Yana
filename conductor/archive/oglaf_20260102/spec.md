# Specification: Reimplement Oglaf Aggregator

## 1. Overview
Port the Oglaf webcomic aggregator from the legacy TypeScript codebase (`old/src/server/aggregators/oglaf.ts`) to the new Python/Django system. This aggregator scrapes `oglaf.com` for the latest comic pages.

## 2. Functional Requirements
-   **Source URL:** The aggregator must fetch content from `https://www.oglaf.com/`.
-   **Implementation:** Create a new `OglafAggregator` class inheriting from `FullWebsiteAggregator` (or appropriate base) in `core/aggregators/website/oglaf/`.
-   **Logic Parity:** Replicate the logic from the legacy TypeScript implementation (`old/src/server/aggregators/oglaf.ts`) 1:1. This includes:
    -   Content selector usage.
    -   Any specific removal of elements (ads, nav, etc.).
    -   Handling of comic image extraction.
    -   Metadata extraction (title, date, etc.).
-   **Registration:** Register the new aggregator type "oglaf" in:
    -   `core/choices.py` (add to `AGGREGATOR_CHOICES`).
    -   `core/aggregators/registry.py` (register the class).

## 3. Non-Functional Requirements
-   Code must adhere to project Python standards (PEP 8, etc.).
-   The implementation must be manually verifiable via the `test_aggregator` management command.

## 4. Acceptance Criteria
-   [ ] The "oglaf" aggregator option appears in the Django Admin for Feeds.
-   [ ] Running `python3 manage.py test_aggregator oglaf` successfully fetches the latest comic.
-   [ ] The extracted content (images, title) matches what is seen on the live site/legacy behavior.
-   [ ] No automated tests are required for this specific task (manual verification per user request).

## 5. Out of Scope
-   New features or improvements to the extraction logic beyond 1:1 porting.
-   Automated unit tests using fixtures (manual verification chosen).
