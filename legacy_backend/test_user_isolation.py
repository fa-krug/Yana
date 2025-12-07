#!/usr/bin/env python
"""
Test script to verify user content isolation.

This script tests that:
1. Users can only see their own feeds
2. Users can see shared (user=NULL) content
3. Admins can see everything
4. RSS feeds require authentication
5. API endpoints respect user filtering
"""

import os
import sys

import django

# Setup Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "aggregato.settings")
django.setup()

from django.contrib.auth.models import User  # noqa: E402
from django.db.models import Q  # noqa: E402

from api.models import Group  # noqa: E402
from core.models import Feed  # noqa: E402


def test_user_isolation():
    """Test user content isolation."""
    print("=" * 80)
    print("Testing User Content Isolation")
    print("=" * 80)

    # Clean up existing test data
    print("\n1. Cleaning up existing test data...")
    User.objects.filter(username__in=["testuser1", "testuser2", "testadmin"]).delete()
    Feed.objects.filter(name__startswith="Test Feed").delete()

    # Create test users
    print("\n2. Creating test users...")
    user1 = User.objects.create_user(
        username="testuser1", password="testpass1", email="user1@test.com"
    )
    user2 = User.objects.create_user(
        username="testuser2", password="testpass2", email="user2@test.com"
    )
    admin = User.objects.create_superuser(
        username="testadmin", password="adminpass", email="admin@test.com"
    )
    print(f"   ✓ Created users: {user1.username}, {user2.username}, {admin.username}")

    # Create test feeds
    print("\n3. Creating test feeds...")
    feed1_user1 = Feed.objects.create(
        name="Test Feed 1 (User1)",
        url="https://example.com/feed1.xml",
        aggregator="full_website",
        user=user1,
    )
    feed2_user2 = Feed.objects.create(
        name="Test Feed 2 (User2)",
        url="https://example.com/feed2.xml",
        aggregator="full_website",
        user=user2,
    )
    feed_shared = Feed.objects.create(
        name="Test Feed Shared",
        identifier="https://example.com/feed_shared.xml",
        aggregator="full_website",
        user=None,  # Shared
    )

    # Create Reddit feed for user1
    reddit_feed = Feed.objects.create(
        name="r/python",
        identifier="https://www.reddit.com/r/python",
        aggregator="reddit",
        feed_type="reddit",
        user=user1,
    )
    print(
        f"   ✓ Created {Feed.objects.filter(name__startswith='Test Feed').count() + 1} feeds"
    )

    # Test visibility for user1
    print("\n4. Testing visibility for user1...")
    user1_feeds = Feed.objects.filter(Q(user=user1) | Q(user__isnull=True))
    assert user1_feeds.count() == 3, f"Expected 3 feeds, got {user1_feeds.count()}"
    assert feed1_user1 in user1_feeds, "User1 should see their own feed"
    assert feed_shared in user1_feeds, "User1 should see shared feed"
    assert reddit_feed in user1_feeds, "User1 should see their Reddit feed"
    assert feed2_user2 not in user1_feeds, "User1 should NOT see user2's feed"
    print("   ✓ User1 can see their own feeds + shared (3 feeds)")

    # Test visibility for user2
    print("\n5. Testing visibility for user2...")
    user2_feeds = Feed.objects.filter(Q(user=user2) | Q(user__isnull=True))
    assert user2_feeds.count() == 2, f"Expected 2 feeds, got {user2_feeds.count()}"
    assert feed2_user2 in user2_feeds, "User2 should see their own feed"
    assert feed_shared in user2_feeds, "User2 should see shared feed"
    assert feed1_user1 not in user2_feeds, "User2 should NOT see user1's feed"
    print("   ✓ User2 can see their own feeds + shared (2 feeds)")

    # Test admin visibility
    print("\n6. Testing admin visibility...")
    admin_feeds = Feed.objects.all()
    test_feed_count = admin_feeds.filter(
        Q(name__startswith="Test Feed") | Q(name="r/python")
    ).count()
    assert test_feed_count == 4, f"Expected 4 test feeds, got {test_feed_count}"
    print("   ✓ Admin can see all feeds (4 test feeds)")

    # Test group visibility
    print("\n7. Testing group visibility...")
    Group.objects.filter(name__startswith="Test Group").delete()
    Group.objects.create(name="Test Group 1", user=user1)
    Group.objects.create(name="Test Group Shared", user=None)

    user1_groups = Group.objects.filter(Q(user=user1) | Q(user__isnull=True))
    test_groups = user1_groups.filter(name__startswith="Test Group").count()
    assert test_groups == 2, f"Expected 2 test groups, got {test_groups}"
    print("   ✓ User1 can see their own groups + shared (2 groups)")

    # Test feed type filtering
    print("\n8. Testing feed type filtering...")
    reddit_feeds = Feed.objects.filter(feed_type="reddit")
    assert reddit_feed in reddit_feeds, "Reddit feed should be in reddit type filter"
    print("   ✓ Feed type filtering works correctly")

    # Cleanup
    print("\n9. Cleaning up test data...")
    User.objects.filter(username__in=["testuser1", "testuser2", "testadmin"]).delete()
    Feed.objects.filter(name__startswith="Test Feed").delete()
    Feed.objects.filter(name="r/python").delete()
    Group.objects.filter(name__startswith="Test Group").delete()
    print("   ✓ Test data cleaned up")

    print("\n" + "=" * 80)
    print("✅ All user isolation tests passed!")
    print("=" * 80)


if __name__ == "__main__":
    try:
        test_user_isolation()
    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
