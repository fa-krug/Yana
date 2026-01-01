#!/usr/bin/env python3
"""
Test script to demonstrate aggregator functionality.

This script creates test feeds and triggers their aggregators.
"""

import os

import django

# Setup Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "yana.settings")
django.setup()

from django.contrib.auth.models import User

from core.models import Feed, FeedGroup
from core.services import AggregatorService


def create_test_data():
    """Create test feeds for demonstration."""
    # Get or create a test user
    user, created = User.objects.get_or_create(
        username="testuser", defaults={"email": "test@example.com"}
    )
    if created:
        user.set_password("testpass123")
        user.save()
        print(f"Created test user: {user.username}")
    else:
        print(f"Using existing user: {user.username}")

    # Create a test group
    group, created = FeedGroup.objects.get_or_create(name="Test Group", user=user)
    if created:
        print(f"Created test group: {group.name}")
    else:
        print(f"Using existing group: {group.name}")

    # Create test feeds for different aggregator types
    test_feeds = [
        {
            "name": "Test Full Website",
            "aggregator": "full_website",
            "identifier": "https://example.com",
        },
        {
            "name": "Test RSS Feed",
            "aggregator": "feed_content",
            "identifier": "https://example.com/rss.xml",
        },
        {
            "name": "Test YouTube Channel",
            "aggregator": "youtube",
            "identifier": "UC_test_channel_id",
        },
        {
            "name": "Test Reddit Subreddit",
            "aggregator": "reddit",
            "identifier": "r/programming",
        },
    ]

    feeds = []
    for feed_data in test_feeds:
        feed, created = Feed.objects.get_or_create(
            name=feed_data["name"],
            user=user,
            defaults={
                "aggregator": feed_data["aggregator"],
                "identifier": feed_data["identifier"],
                "group": group,
                "daily_limit": 10,
                "enabled": True,
            },
        )
        feeds.append(feed)
        if created:
            print(f"Created feed: {feed.name} ({feed.aggregator})")
        else:
            print(f"Using existing feed: {feed.name} ({feed.aggregator})")

    return feeds


def main():
    """Main test function."""
    print("\n" + "=" * 70)
    print("AGGREGATOR SERVICE TEST")
    print("=" * 70 + "\n")

    # Create test data
    print("Creating test data...")
    print("-" * 70)
    feeds = create_test_data()
    print("-" * 70 + "\n")

    # Test 1: Trigger specific feed by ID
    print("\nTest 1: Trigger specific feed by ID")
    print("-" * 70)
    if feeds:
        result = AggregatorService.trigger_by_feed_id(feeds[0].id)
        print(f"\nResult: {result}")
        print("-" * 70)

    # Test 2: Trigger by aggregator type
    print("\nTest 2: Trigger all 'youtube' feeds")
    print("-" * 70)
    results = AggregatorService.trigger_by_aggregator_type("youtube")
    print(f"\nProcessed {len(results)} feed(s)")
    for result in results:
        print(f"  - {result}")
    print("-" * 70)

    # Test 3: Trigger all feeds with limit
    print("\nTest 3: Trigger all enabled feeds (limit: 2)")
    print("-" * 70)
    results = AggregatorService.trigger_all(limit=2)
    print(f"\nProcessed {len(results)} feed(s)")
    for result in results:
        print(f"  - {result}")
    print("-" * 70)

    print("\n" + "=" * 70)
    print("TEST COMPLETED")
    print("=" * 70 + "\n")

    print("\nYou can also use the Django management command:")
    print("  python3 manage.py trigger_aggregator --feed-id 1")
    print("  python3 manage.py trigger_aggregator --aggregator-type youtube")
    print("  python3 manage.py trigger_aggregator --all")
    print("  python3 manage.py trigger_aggregator --all --limit 5")


if __name__ == "__main__":
    main()
