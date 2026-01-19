# Reddit Image Resolution Analysis

## Reddit API Image Structure

Reddit's API provides images through several fields in the post data:

### 1. `thumbnail` field
- **Resolution:** Low (70x70, 140x140, or similar)
- **Type:** String URL
- **Example:** `"https://b.thumbs.redditmedia.com/abc123.jpg"`
- **Values:** URL, "self", "default", "nsfw", "spoiler"

### 2. `preview` object
Contains high-resolution images and multiple resolutions:

```json
{
  "preview": {
    "images": [
      {
        "source": {
          "url": "https://preview.redd.it/abc123.jpg?width=1920&height=1080",
          "width": 1920,
          "height": 1080
        },
        "resolutions": [
          {
            "url": "https://preview.redd.it/abc123.jpg?width=108&height=60",
            "width": 108,
            "height": 60
          },
          {
            "url": "https://preview.redd.it/abc123.jpg?width=216&height=120",
            "width": 216,
            "height": 120
          },
          {
            "url": "https://preview.redd.it/abc123.jpg?width=320&height=180",
            "width": 320,
            "height": 180
          }
        ],
        "variants": {
          "gif": { ... },
          "mp4": { ... }
        }
      }
    ]
  }
}
```

### 3. `url` field
- **Resolution:** Original (if direct image link)
- **Type:** String URL
- **May point to:** Direct image, external URL, reddit.com post, v.redd.it video

## Current Implementation Analysis

### Header Image Priority (in `extract_header_image_url()`)

1. **Priority 0:** YouTube video embeds
2. **Priority 1:** Gallery posts (`gallery_data.items[0]` via `media_metadata`)
3. **Priority 2:** Direct image posts (`.jpg`, `.png`, etc. in `url` field)
4. **Priority 3:** Images from selftext
5. **Priority 4:** **Thumbnail extraction (fallback)**
6. **Priority 5:** Extract from linked page

### Thumbnail Extraction (in `extract_thumbnail_url()`)

The thumbnail extraction function DOES attempt to get high-resolution images:

```python
def extract_thumbnail_url(post: RedditPostData) -> Optional[str]:
    # 1. Try post.thumbnail (LOW RES - 70x70 to 140x140)
    if post.thumbnail and post.thumbnail not in ["self", "default", "nsfw", "spoiler"]:
        return post.thumbnail

    # 2. Try preview.images[0].source.url (HIGH RES - ORIGINAL RESOLUTION)
    if post.preview and post.preview.get("images"):
        source_url = post.preview["images"][0].get("source", {}).get("url")
        if source_url:
            return fix_reddit_media_url(decoded)

    # 3. Try post.url if it's an image (ORIGINAL)
    if post.url and is_image_extension(post.url):
        return post.url
```

## The Issue

**The current implementation has a flaw in `extract_thumbnail_url()`:**

It returns early with the low-resolution `post.thumbnail` field BEFORE checking `post.preview.images[0].source`, which contains the high-resolution version.

### What Happens:
1. If `post.thumbnail` exists and is a valid URL → **Returns low-res image**
2. Never reaches the `post.preview.images[0].source` check → **Misses high-res image**

## The Answer to Your Question

**Q: When extracting the header image in a Reddit feed, what has precedence? Thumbnail or image found in remote URL?**

**A:** Currently, images found in remote URLs have precedence in `extract_header_image_url()`, but within the thumbnail extraction function itself (`extract_thumbnail_url()`), there's a bug where **low-resolution thumbnails have precedence over high-resolution preview images**.

The function should be checking `preview.images[0].source` (high-res) BEFORE falling back to the `thumbnail` field (low-res).

## Recommended Fix

Reverse the priority order in `extract_thumbnail_url()`:

```python
def extract_thumbnail_url(post: RedditPostData) -> Optional[str]:
    """Extract highest resolution thumbnail URL from Reddit post."""

    # Priority 1: Try preview images (HIGH RES - ORIGINAL)
    if post.preview and post.preview.get("images") and len(post.preview["images"]) > 0:
        source_url = post.preview["images"][0].get("source", {}).get("url")
        if source_url:
            decoded = decode_html_entities_in_url(source_url)
            return fix_reddit_media_url(decoded)

    # Priority 2: Try post URL if it's an image (ORIGINAL)
    if post.url:
        decoded_url = decode_html_entities_in_url(post.url)
        url_lower = decoded_url.lower()
        if any(ext in url_lower for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]):
            return decoded_url
        if "v.redd.it" in url_lower:
            return extract_reddit_video_preview(post)

    # Priority 3: Fall back to thumbnail (LOW RES - last resort)
    if post.thumbnail and post.thumbnail not in ["self", "default", "nsfw", "spoiler"]:
        if post.thumbnail.startswith("http"):
            return decode_html_entities_in_url(post.thumbnail)
        if post.thumbnail.startswith("/"):
            return decode_html_entities_in_url(f"https://reddit.com{post.thumbnail}")

    return None
```

## Testing Approach

Since Reddit API is currently inaccessible from this environment, you should:

1. Configure your Reddit API credentials in the Django admin
2. Create a test feed for the subreddit
3. Run: `python manage.py test_aggregator <feed_id> --verbose --first 1`
4. Check if images are high-resolution or low-resolution thumbnails

The fix will ensure `preview.images[0].source` (high-res) is always preferred over `thumbnail` (low-res).
