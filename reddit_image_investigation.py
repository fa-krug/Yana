#!/usr/bin/env python3
"""
Reddit Image Resolution Investigation Script

This script fetches a Reddit post and examines all available image data
to find the highest resolution thumbnail/preview images.
"""

import json
import sys
from pprint import pprint

import requests


def get_access_token(client_id: str, client_secret: str, user_agent: str = "Yana/1.0") -> str:
    """Get Reddit OAuth2 access token using client credentials flow."""
    auth_url = "https://www.reddit.com/api/v1/access_token"
    auth_data = {"grant_type": "client_credentials"}

    print(f"🔐 Authenticating with Reddit API...")
    print(f"   Client ID: {client_id}")
    print(f"   User Agent: {user_agent}")
    print(f"   Grant Type: client_credentials")

    response = requests.post(
        auth_url,
        data=auth_data,
        auth=(client_id, client_secret),
        headers={
            "User-Agent": user_agent,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout=10,
    )

    print(f"   Response Status: {response.status_code}")
    if response.status_code != 200:
        print(f"   Response Headers: {dict(response.headers)}")
        print(f"   Response Body: {response.text}")

    response.raise_for_status()

    data = response.json()
    if data.get("access_token") and data.get("token_type") == "bearer":
        print(f"✅ Authentication successful!")
        return data["access_token"]

    raise ValueError("Invalid response from Reddit OAuth API")


def fetch_post_data(subreddit: str, post_id: str, access_token: str, user_agent: str = "Yana/1.0"):
    """Fetch post data from Reddit API."""
    url = f"https://oauth.reddit.com/r/{subreddit}/comments/{post_id}"

    print(f"\n📡 Fetching post data from: {url}")
    response = requests.get(
        url,
        headers={
            "Authorization": f"Bearer {access_token}",
            "User-Agent": user_agent,
        },
        timeout=30,
    )
    response.raise_for_status()

    data = response.json()
    print(f"✅ Post data fetched successfully!")
    return data


def analyze_image_data(post_data):
    """Analyze and print all available image data from the post."""
    if not post_data or len(post_data) == 0:
        print("❌ No post data found")
        return

    # The response is an array: [post_listing, comments_listing]
    post_listing = post_data[0]
    children = post_listing.get("data", {}).get("children", [])

    if not children:
        print("❌ No posts found in response")
        return

    post = children[0].get("data", {})

    print("\n" + "=" * 80)
    print("POST INFORMATION")
    print("=" * 80)
    print(f"Title: {post.get('title', 'N/A')}")
    print(f"Author: {post.get('author', 'N/A')}")
    print(f"Subreddit: {post.get('subreddit', 'N/A')}")
    print(f"Post Type: {'Gallery' if post.get('is_gallery') else 'Regular'}")
    print(f"Self Post: {post.get('is_self', False)}")
    print(f"URL: {post.get('url', 'N/A')}")

    print("\n" + "=" * 80)
    print("THUMBNAIL DATA")
    print("=" * 80)
    thumbnail = post.get("thumbnail")
    print(f"Thumbnail field: {thumbnail}")

    print("\n" + "=" * 80)
    print("PREVIEW DATA (All Available Resolutions)")
    print("=" * 80)

    preview = post.get("preview")
    if preview:
        images = preview.get("images", [])
        if images:
            for idx, image_data in enumerate(images):
                print(f"\n📸 Image #{idx + 1}:")

                # Source (highest resolution)
                source = image_data.get("source", {})
                if source:
                    print(f"\n  🎯 SOURCE (Highest Resolution):")
                    print(f"     URL: {source.get('url', 'N/A')}")
                    print(f"     Width: {source.get('width', 'N/A')}")
                    print(f"     Height: {source.get('height', 'N/A')}")

                # Resolutions (scaled versions)
                resolutions = image_data.get("resolutions", [])
                if resolutions:
                    print(f"\n  📐 RESOLUTIONS (Scaled Versions):")
                    for res_idx, res in enumerate(resolutions):
                        print(f"     #{res_idx + 1}: {res.get('width')}x{res.get('height')}")
                        print(f"          URL: {res.get('url', 'N/A')}")

                # Variants (GIF, MP4, etc.)
                variants = image_data.get("variants", {})
                if variants:
                    print(f"\n  🎬 VARIANTS:")
                    for variant_type, variant_data in variants.items():
                        print(f"     Type: {variant_type}")
                        variant_source = variant_data.get("source", {})
                        if variant_source:
                            print(f"       Source URL: {variant_source.get('url', 'N/A')}")
                            print(f"       Dimensions: {variant_source.get('width')}x{variant_source.get('height')}")
    else:
        print("⚠️  No preview data available")

    print("\n" + "=" * 80)
    print("GALLERY DATA")
    print("=" * 80)

    is_gallery = post.get("is_gallery", False)
    if is_gallery:
        gallery_data = post.get("gallery_data", {})
        media_metadata = post.get("media_metadata", {})

        if gallery_data:
            items = gallery_data.get("items", [])
            print(f"Gallery contains {len(items)} items:")
            for idx, item in enumerate(items):
                media_id = item.get("media_id")
                print(f"\n  📸 Gallery Item #{idx + 1} (media_id: {media_id}):")

                if media_id and media_metadata:
                    media_info = media_metadata.get(media_id, {})
                    print(f"     Type: {media_info.get('e', 'N/A')}")
                    print(f"     Status: {media_info.get('status', 'N/A')}")

                    # Get the source image data
                    source_data = media_info.get("s", {})
                    if source_data:
                        # For regular images
                        if media_info.get("e") == "Image":
                            print(f"     Source URL: {source_data.get('u', 'N/A')}")
                            print(f"     Dimensions: {source_data.get('x')}x{source_data.get('y')}")
                        # For animated images
                        elif media_info.get("e") == "AnimatedImage":
                            gif_url = source_data.get("gif")
                            mp4_url = source_data.get("mp4")
                            if gif_url:
                                print(f"     GIF URL: {gif_url}")
                            if mp4_url:
                                print(f"     MP4 URL: {mp4_url}")
                            print(f"     Dimensions: {source_data.get('x')}x{source_data.get('y')}")
    else:
        print("Not a gallery post")

    print("\n" + "=" * 80)
    print("MEDIA DATA")
    print("=" * 80)

    media = post.get("media")
    if media:
        print("Media object present:")
        pprint(media, indent=2)
    else:
        print("No media object")

    # Save full post data to JSON for detailed inspection
    output_file = "reddit_post_data.json"
    with open(output_file, "w") as f:
        json.dump(post, f, indent=2)
    print(f"\n💾 Full post data saved to: {output_file}")


def fetch_post_data_public(subreddit: str, post_id: str, user_agent: str = "Yana/1.0"):
    """Fetch post data using public JSON endpoint (no auth required)."""
    url = f"https://www.reddit.com/r/{subreddit}/comments/{post_id}.json"

    print(f"\n📡 Fetching post data from public endpoint: {url}")
    response = requests.get(
        url,
        headers={
            "User-Agent": user_agent,
        },
        timeout=30,
    )
    response.raise_for_status()

    data = response.json()
    print(f"✅ Post data fetched successfully!")
    return data


def main():
    # Configuration
    CLIENT_ID = "e8KnO_-rZx8f2xf3KIRCxw"
    CLIENT_SECRET = "WvTGu2nMkWPKsrVrcg_o5Jz2sQkdmg"
    USER_AGENT = "RedditImageInvestigation/1.0"

    # Post to investigate
    POST_URL = "https://reddit.com/r/google_antigravity/comments/1qezfxj/gemini_3_pro_high_has_been_performing_quite_well/"

    # Extract subreddit and post_id from URL
    # Format: https://reddit.com/r/{subreddit}/comments/{post_id}/{title}/
    parts = POST_URL.split("/")
    try:
        r_idx = parts.index("r")
        comments_idx = parts.index("comments")
        subreddit = parts[r_idx + 1]
        post_id = parts[comments_idx + 1]
    except (ValueError, IndexError):
        print(f"❌ Invalid Reddit URL format: {POST_URL}")
        sys.exit(1)

    print(f"🔍 Investigating Reddit post:")
    print(f"   Subreddit: r/{subreddit}")
    print(f"   Post ID: {post_id}")

    try:
        # Try OAuth first, fall back to public endpoint
        try:
            # Get access token
            access_token = get_access_token(CLIENT_ID, CLIENT_SECRET, USER_AGENT)
            # Fetch post data
            post_data = fetch_post_data(subreddit, post_id, access_token, USER_AGENT)
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 403:
                print("\n⚠️  OAuth authentication failed, trying public endpoint...")
                post_data = fetch_post_data_public(subreddit, post_id, USER_AGENT)
            else:
                raise

        # Analyze image data
        analyze_image_data(post_data)

        print("\n✅ Investigation complete!")

    except requests.exceptions.HTTPError as e:
        print(f"\n❌ HTTP Error: {e}")
        if e.response is not None:
            print(f"   Status: {e.response.status_code}")
            print(f"   Response: {e.response.text}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
