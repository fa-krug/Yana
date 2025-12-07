#!/usr/bin/env python
"""
Test script to verify RSS feed Basic Authentication.

Tests:
1. Unauthenticated access returns 401
2. Invalid credentials return 401
3. Valid credentials grant access
4. Session authentication works
5. User can only access their own feeds + shared feeds
"""

import base64
import os
import sys

import django

# Setup Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "aggregato.settings")
django.setup()

from django.contrib.auth.models import User  # noqa: E402
from django.test import Client  # noqa: E402

from core.models import Feed  # noqa: E402


def test_rss_authentication():
    """Test RSS feed authentication."""
    print("=" * 80)
    print("Testing RSS Feed Authentication")
    print("=" * 80)

    # Clean up existing test data
    print("\n1. Cleaning up existing test data...")
    User.objects.filter(username__in=["testuser1", "testuser2"]).delete()
    Feed.objects.filter(name__startswith="Test Feed Auth").delete()

    # Create test users
    print("\n2. Creating test users...")
    user1 = User.objects.create_user(
        username="testuser1", password="testpass1", email="user1@test.com"
    )
    user2 = User.objects.create_user(
        username="testuser2", password="testpass2", email="user2@test.com"
    )
    print(f"   ✓ Created users: {user1.username}, {user2.username}")

    # Create test feeds
    print("\n3. Creating test feeds...")
    feed1 = Feed.objects.create(
        name="Test Feed Auth 1 (User1)",
        url="https://example.com/feed1.xml",
        aggregator="generic",
        user=user1,
    )
    feed_shared = Feed.objects.create(
        name="Test Feed Auth Shared",
        identifier="https://example.com/feed_shared.xml",
        aggregator="generic",
        user=None,
    )
    print(f"   ✓ Created feeds: {feed1.id}, {feed_shared.id}")

    client = Client()

    # Test 1: Unauthenticated access returns 401
    print("\n4. Testing unauthenticated access...")
    response = client.get(f"/feeds/{feed1.id}/rss.xml")
    assert response.status_code == 401, f"Expected 401, got {response.status_code}"
    assert "WWW-Authenticate" in response, (
        "Expected WWW-Authenticate header in response"
    )
    print("   ✓ Unauthenticated access returns 401 with WWW-Authenticate header")

    # Test 2: Invalid credentials return 401
    print("\n5. Testing invalid credentials...")
    invalid_creds = base64.b64encode(b"testuser1:wrongpassword").decode("utf-8")
    response = client.get(
        f"/feeds/{feed1.id}/rss.xml", HTTP_AUTHORIZATION=f"Basic {invalid_creds}"
    )
    assert response.status_code == 401, f"Expected 401, got {response.status_code}"
    print("   ✓ Invalid credentials return 401")

    # Test 3: Valid credentials grant access
    print("\n6. Testing valid credentials...")
    valid_creds = base64.b64encode(b"testuser1:testpass1").decode("utf-8")
    response = client.get(
        f"/feeds/{feed1.id}/rss.xml", HTTP_AUTHORIZATION=f"Basic {valid_creds}"
    )
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    assert (
        "application/rss+xml" in response["Content-Type"]
        or "text/xml" in response["Content-Type"]
    ), f"Expected RSS content type, got {response['Content-Type']}"
    print("   ✓ Valid credentials grant access (200 OK)")

    # Test 4: User can access shared feeds
    print("\n7. Testing access to shared feed...")
    response = client.get(
        f"/feeds/{feed_shared.id}/rss.xml", HTTP_AUTHORIZATION=f"Basic {valid_creds}"
    )
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    print("   ✓ User can access shared feeds")

    # Test 5: User cannot access another user's feed
    print("\n8. Testing access to another user's feed...")
    feed2 = Feed.objects.create(
        name="Test Feed Auth 2 (User2)",
        url="https://example.com/feed2.xml",
        aggregator="generic",
        user=user2,
    )
    response = client.get(
        f"/feeds/{feed2.id}/rss.xml", HTTP_AUTHORIZATION=f"Basic {valid_creds}"
    )
    assert response.status_code == 403, f"Expected 403, got {response.status_code}"
    print("   ✓ User cannot access another user's feed (403 Forbidden)")

    # Test 6: Session authentication works
    print("\n9. Testing session authentication...")
    client.login(username="testuser1", password="testpass1")
    response = client.get(f"/feeds/{feed1.id}/rss.xml")
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    print("   ✓ Session authentication works")

    # Cleanup
    print("\n10. Cleaning up test data...")
    User.objects.filter(username__in=["testuser1", "testuser2"]).delete()
    Feed.objects.filter(name__startswith="Test Feed Auth").delete()
    print("   ✓ Test data cleaned up")

    print("\n" + "=" * 80)
    print("✅ All RSS authentication tests passed!")
    print("=" * 80)


if __name__ == "__main__":
    try:
        test_rss_authentication()
    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
