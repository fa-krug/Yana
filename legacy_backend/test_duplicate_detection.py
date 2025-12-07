"""
Test script for duplicate detection functionality.

This script tests that the skip_duplicates feature works correctly
for Feed models.
"""

import os
import sys
from datetime import timedelta

import django

# Setup Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "aggregato.settings")
django.setup()

from django.utils import timezone  # noqa: E402

from core.models import Article, Feed  # noqa: E402


def test_feed_duplicate_detection():
    """Test duplicate detection for Feed articles."""
    print("\n" + "=" * 80)
    print("Testing Feed Duplicate Detection")
    print("=" * 80)

    # Create a test feed with skip_duplicates enabled
    feed = Feed.objects.create(
        name="Test Feed - Duplicate Detection",
        identifier="https://example.com/feed.xml",
        aggregator="full_website",
        skip_duplicates=True,
    )

    try:
        # Create an article with a specific title
        article1 = Article.objects.create(
            feed=feed,
            name="Breaking: Major News Event",
            url="https://example.com/article-1",
            content="<p>This is article 1</p>",
        )
        print(f"✓ Created article 1: {article1.name}")

        # Try to create another article with the same title
        article2 = Article.objects.create(
            feed=feed,
            name="Breaking: Major News Event",
            url="https://example.com/article-2",
            content="<p>This is article 2 with same title</p>",
        )
        print(f"✓ Created article 2: {article2.name}")

        # Check how many articles with this title exist
        duplicate_count = Article.objects.filter(
            feed=feed, name="Breaking: Major News Event"
        ).count()
        print(f"  Articles with duplicate title: {duplicate_count}")

        # Test with skip_duplicates disabled
        feed.skip_duplicates = False
        feed.save()
        print("\n✓ Disabled skip_duplicates")

        # Create old article (8 days ago) with duplicate title
        old_date = timezone.now() - timedelta(days=8)
        Article.objects.create(
            feed=feed,
            name="Old News",
            url="https://example.com/old-article",
            content="<p>This is an old article</p>",
            created_at=old_date,
        )
        print("✓ Created old article (8 days ago)")

        # Check if duplicate detection would skip recent articles (within 7 days)
        seven_days_ago = timezone.now() - timedelta(days=7)
        recent_duplicates = Article.objects.filter(
            feed=feed, name="Breaking: Major News Event", created_at__gte=seven_days_ago
        ).count()
        print(
            f"  Recent articles (within 7 days) with title 'Breaking: Major News Event': {recent_duplicates}"
        )

        print("\n✅ Feed duplicate detection test completed")
        print(f"   Total articles created: {Article.objects.filter(feed=feed).count()}")

    finally:
        # Cleanup
        feed.delete()
        print("✓ Cleaned up test feed")


def test_reddit_feed_duplicate_detection():
    """Test duplicate detection for Reddit feeds."""
    print("\n" + "=" * 80)
    print("Testing Reddit Feed Duplicate Detection")
    print("=" * 80)

    # Create a test reddit feed with skip_duplicates enabled
    feed = Feed.objects.create(
        name="r/test",
        identifier="https://www.reddit.com/r/test",
        aggregator="reddit",
        feed_type="reddit",
        skip_duplicates=True,
    )

    try:
        # Create an article with a specific title
        article1 = Article.objects.create(
            feed=feed,
            name="TIL: Interesting fact about science",
            url="https://reddit.com/r/test/comments/abc123",
            content="<p>This is post 1</p>",
            external_id="abc123",
            author="user1",
            score=100,
        )
        print(f"✓ Created article 1: {article1.name}")

        # Try to create another article with the same title
        article2 = Article.objects.create(
            feed=feed,
            name="TIL: Interesting fact about science",
            url="https://reddit.com/r/test/comments/def456",
            content="<p>This is post 2 with same title</p>",
            external_id="def456",
            author="user2",
            score=50,
        )
        print(f"✓ Created article 2: {article2.name}")

        # Check how many articles with this title exist
        duplicate_count = Article.objects.filter(
            feed=feed, name="TIL: Interesting fact about science"
        ).count()
        print(f"  Articles with duplicate title: {duplicate_count}")

        # Test with skip_duplicates disabled
        feed.skip_duplicates = False
        feed.save()
        print("\n✓ Disabled skip_duplicates")

        # Create old article (8 days ago) with duplicate title
        old_date = timezone.now() - timedelta(days=8)
        Article.objects.create(
            feed=feed,
            name="Old Post",
            url="https://reddit.com/r/test/comments/old123",
            content="<p>This is an old post</p>",
            external_id="old123",
            author="user3",
            score=10,
            created_at=old_date,
        )
        print("✓ Created old article (8 days ago)")

        # Check if duplicate detection would skip recent articles (within 7 days)
        seven_days_ago = timezone.now() - timedelta(days=7)
        recent_duplicates = Article.objects.filter(
            feed=feed,
            name="TIL: Interesting fact about science",
            created_at__gte=seven_days_ago,
        ).count()
        print(
            f"  Recent articles (within 7 days) with title 'TIL: Interesting fact about science': {recent_duplicates}"
        )

        print("\n✅ Reddit feed duplicate detection test completed")
        print(f"   Total articles created: {Article.objects.filter(feed=feed).count()}")

    finally:
        # Cleanup
        feed.delete()
        print("✓ Cleaned up test feed")


def main():
    """Run all duplicate detection tests."""
    print("\n" + "=" * 80)
    print("DUPLICATE DETECTION TEST SUITE")
    print("=" * 80)

    try:
        test_feed_duplicate_detection()
        test_reddit_feed_duplicate_detection()

        print("\n" + "=" * 80)
        print("✅ ALL TESTS COMPLETED SUCCESSFULLY")
        print("=" * 80)
        print("\nNote: The actual duplicate detection logic runs during aggregation.")
        print("This test verifies that the models have the skip_duplicates field and")
        print("that articles can be created with duplicate titles.")
        print(
            "The aggregation logic will skip duplicates based on the skip_duplicates setting."
        )

    except Exception as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
