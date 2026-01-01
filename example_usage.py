#!/usr/bin/env python3
"""
Example usage of the aggregator service.

This demonstrates different ways to use the aggregator system.
"""

import os

import django

# Setup Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "yana.settings")
django.setup()

from core.models import Feed
from core.services import AggregatorService


def example_1_trigger_by_id():
    """Example 1: Trigger aggregator by feed ID."""
    print("\n" + "=" * 70)
    print("Example 1: Trigger aggregator by feed ID")
    print("=" * 70)

    feed_id = 1
    result = AggregatorService.trigger_by_feed_id(feed_id)

    if result["success"]:
        print(f"\n✓ Successfully aggregated feed '{result['feed_name']}'")
        print(f"  Articles found: {result['articles_count']}")
    else:
        print("\n✗ Failed to aggregate feed")
        print(f"  Error: {result.get('error')}")


def example_2_trigger_by_type():
    """Example 2: Trigger all feeds of a specific type."""
    print("\n" + "=" * 70)
    print("Example 2: Trigger all YouTube feeds")
    print("=" * 70)

    results = AggregatorService.trigger_by_aggregator_type("youtube")

    print(f"\nProcessed {len(results)} YouTube feed(s):")
    for result in results:
        status = "✓" if result["success"] else "✗"
        print(f"  {status} {result['feed_name']} - {result['articles_count']} articles")


def example_3_trigger_all_with_limit():
    """Example 3: Trigger all feeds with a limit."""
    print("\n" + "=" * 70)
    print("Example 3: Trigger all enabled feeds (limit: 5)")
    print("=" * 70)

    results = AggregatorService.trigger_all(limit=5)

    print(f"\nProcessed {len(results)} feed(s):")
    for result in results:
        status = "✓" if result["success"] else "✗"
        print(
            f"  {status} {result['feed_name']} ({result['aggregator_type']}) - {result['articles_count']} articles"
        )


def example_4_error_handling():
    """Example 4: Error handling."""
    print("\n" + "=" * 70)
    print("Example 4: Error handling")
    print("=" * 70)

    try:
        # Try to trigger a non-existent feed
        result = AggregatorService.trigger_by_feed_id(99999)
    except Exception as e:
        print(f"\n✗ Caught exception: {e}")


def example_5_check_feed_status():
    """Example 5: Check feed status before triggering."""
    print("\n" + "=" * 70)
    print("Example 5: Check feed status before triggering")
    print("=" * 70)

    # Get first feed
    feed = Feed.objects.first()
    if feed:
        print(f"\nFeed: {feed.name}")
        print(f"  ID: {feed.id}")
        print(f"  Type: {feed.aggregator}")
        print(f"  Identifier: {feed.identifier}")
        print(f"  Enabled: {feed.enabled}")
        print(f"  Daily limit: {feed.daily_limit}")

        if feed.enabled:
            print("\nTriggering aggregator...")
            result = AggregatorService.trigger_by_feed_id(feed.id)
            print(f"Result: {result['success']}")
        else:
            print("\n⚠ Feed is disabled, skipping aggregation")
    else:
        print("\nNo feeds found in database")


def main():
    """Run all examples."""
    print("\n" + "=" * 70)
    print("AGGREGATOR SERVICE USAGE EXAMPLES")
    print("=" * 70)

    # Check if there are any feeds
    feed_count = Feed.objects.count()
    if feed_count == 0:
        print("\n⚠ No feeds found in database!")
        print("Run 'python3 test_aggregators.py' first to create test data.")
        return

    print(f"\nFound {feed_count} feed(s) in database")

    # Run examples
    example_1_trigger_by_id()
    example_2_trigger_by_type()
    example_3_trigger_all_with_limit()
    example_4_error_handling()
    example_5_check_feed_status()

    print("\n" + "=" * 70)
    print("EXAMPLES COMPLETED")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    main()
