# Specification: YouTube Aggregator Reimplementation

## Overview
Reimplement the YouTube aggregator in Python, porting the logic from the legacy TypeScript implementation. This aggregator will use the YouTube Data API v3 to fetch videos from specific channels and present them as articles within Yana.

## Functional Requirements
- **Authentication:** Use `youtube_api_key` and `youtube_enabled` from the `UserSettings` model.
- **Channel Resolution:** Support resolving YouTube channel identifiers to Channel IDs.
    - Supported formats: Handles (e.g., `@mkbhd`), Channel IDs (e.g., `UC...`), and full Channel URLs.
- **Data Fetching:**
    - Fetch the latest videos from a channel's "uploads" playlist.
    - Fetch video metadata: Title, Description, Published Date, Thumbnail.
    - Fetch a configurable number of top comments for each video (default: 10).
- **Content Generation:**
    - Generate a "Header Element" containing a YouTube `<iframe>` embed for the video.
    - Include the video description in the article body.
    - Append a "Comments" section with the fetched top comments.
- **Validation:** Validate the YouTube API key and the channel identifier during feed configuration.
- **Autocomplete (Admin):** Implement channel search in the Django Admin Feed identifier field. This will use the YouTube API to search for channels based on the user's input.

## Non-Functional Requirements
- **API Quota Management:** Implement efficient fetching to minimize YouTube API quota usage (e.g., batching video detail requests).
- **Error Handling:** Gracefully handle API errors (quota exceeded, invalid keys, private videos).

## Acceptance Criteria
- [ ] Users can create a YouTube feed by providing a channel handle or URL.
- [ ] The Feed identifier field in Admin provides autocomplete search for YouTube channels.
- [ ] The aggregator successfully fetches and saves new videos as Articles.
- [ ] Articles contain a working YouTube embed in the header.
- [ ] Articles include the video description and top comments.
- [ ] The aggregator respects the `daily_limit` set on the feed.

## Out of Scope
- Fetching YouTube Shorts (unless they appear in the uploads playlist).
- Subscription management (using OAuth to fetch a user's own subscriptions).
- Advanced video statistics (view counts, likes) in the article body.
