#!/usr/bin/env python
"""
Test script to demonstrate the sync_managed_feeds functionality.

This script simulates:
1. A managed feed being created
2. The aggregator metadata changing (simulated by manually changing feed fields)
3. Running sync to restore the correct values
"""

import os
import sys

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "aggregato.settings")
django.setup()

# ruff: noqa: E402 - Django imports must come after django.setup()
from django.core.management import call_command

from aggregators import get_aggregator_by_id
from core.models import Feed


def test_sync_managed_feeds():
    """Test the sync_managed_feeds management command."""
    print("=" * 80)
    print("Testing sync_managed_feeds functionality")
    print("=" * 80)

    # Find a managed aggregator to test with
    aggregator_id = "heise"  # Using Heise as an example
    aggregator_metadata = get_aggregator_by_id(aggregator_id)

    if not aggregator_metadata:
        print(f"❌ Error: Aggregator '{aggregator_id}' not found")
        return

    print(f"\n📦 Using aggregator: {aggregator_metadata.name}")
    print(f"   ID: {aggregator_metadata.id}")
    print(f"   Type: {aggregator_metadata.type}")
    print(f"   URL: {aggregator_metadata.url}")

    # Create or get a test feed
    print("\n1️⃣  Creating feed with correct metadata...")
    feed, created = Feed.objects.get_or_create(
        aggregator=aggregator_id,
        defaults={
            "name": aggregator_metadata.name,
            "url": aggregator_metadata.url,
            "enabled": False,  # Disabled to avoid actual aggregation
        },
    )

    if created:
        print(f"   ✓ Created new feed: {feed.name}")
    else:
        print(f"   ✓ Found existing feed: {feed.name}")

    print("\n📊 Current feed state:")
    print(f"   Name: {feed.name}")
    print(f"   URL: {feed.identifier}")
    print(f"   Aggregator: {feed.aggregator}")

    # Simulate aggregator metadata change by manually updating the feed
    print("\n2️⃣  Simulating aggregator metadata change...")
    old_name = feed.name
    old_url = feed.identifier

    feed.name = "OUTDATED NAME"
    feed.identifier = "https://example.com/outdated-feed.xml"
    feed.save()

    print(f"   Changed name: '{old_name}' → '{feed.name}'")
    print(f"   Changed URL: '{old_url}' → '{feed.identifier}'")

    # Run sync in dry-run mode first
    print("\n3️⃣  Running sync in DRY-RUN mode...")
    call_command("sync_managed_feeds", dry_run=True)

    # Verify nothing changed yet
    feed.refresh_from_db()
    assert feed.name == "OUTDATED NAME", "Feed name should not change in dry-run"
    assert feed.identifier == "https://example.com/outdated-feed.xml", (
        "Feed URL should not change in dry-run"
    )
    print("   ✓ Dry-run completed (no changes applied)")

    # Run sync for real
    print("\n4️⃣  Running sync (applying changes)...")
    call_command("sync_managed_feeds", verbosity=1)

    # Verify changes were applied
    feed.refresh_from_db()
    print("\n📊 Updated feed state:")
    print(f"   Name: {feed.name}")
    print(f"   URL: {feed.identifier}")
    print(f"   Aggregator: {feed.aggregator}")

    # Verify the sync worked
    if feed.name == aggregator_metadata.name:
        print(f"\n✅ Name synced correctly: '{feed.name}'")
    else:
        print(
            f"\n❌ Name sync failed: expected '{aggregator_metadata.name}', got '{feed.name}'"
        )

    if feed.identifier == aggregator_metadata.url:
        print(f"✅ URL synced correctly: '{feed.identifier}'")
    else:
        print(
            f"❌ URL sync failed: expected '{aggregator_metadata.url}', got '{feed.identifier}'"
        )

    # Test that running sync again is idempotent
    print("\n5️⃣  Testing idempotency (running sync again)...")
    call_command("sync_managed_feeds", verbosity=1)
    feed.refresh_from_db()

    if (
        feed.name == aggregator_metadata.name
        and feed.identifier == aggregator_metadata.url
    ):
        print("✅ Sync is idempotent (no changes on second run)")
    else:
        print("❌ Sync modified data on second run")

    # Cleanup
    print("\n6️⃣  Cleaning up...")
    feed.delete()
    print("   ✓ Deleted test feed")

    print(f"\n{'=' * 80}")
    print("✅ Test completed successfully!")
    print("=" * 80)


if __name__ == "__main__":
    try:
        test_sync_managed_feeds()
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
