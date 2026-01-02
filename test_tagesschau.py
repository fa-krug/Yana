import os


def test_tagesschau():
    import django

    # Set up Django environment
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "yana.settings")
    django.setup()

    from core.aggregators.tagesschau import TagesschauAggregator
    from core.models import Feed, FeedGroup, User

    # Get or create a test user
    user, _ = User.objects.get_or_create(username="testuser")

    # Get or create a test group
    group, _ = FeedGroup.objects.get_or_create(name="News", user=user)

    # Create a test feed for Tagesschau if it doesn't exist
    feed, created = Feed.objects.get_or_create(
        name="Tagesschau",
        aggregator="tagesschau",
        identifier="https://www.tagesschau.de/xml/rss2/",
        user=user,
        group=group,
    )

    print(f"Testing Tagesschau aggregator with feed ID: {feed.id}")

    aggregator = TagesschauAggregator(feed)
    articles = aggregator.aggregate()

    print(f"Successfully aggregated {len(articles)} articles.")

    for i, article in enumerate(articles[:3]):
        print(f"\nArticle {i + 1}: {article['name']}")
        print(f"URL: {article['identifier']}")
        print(f"Content length: {len(article['content'])}")
        # Check if media header is present
        if '<header class="media-header">' in article["content"]:
            print("✓ Media header found")
        else:
            print("✗ No media header found (might be normal for this article)")

        # Check if textabsatz was used (no textabsatz classes should remain)
        if "textabsatz" in article["content"]:
            print("✗ 'textabsatz' class still present in content")
        else:
            print("✓ 'textabsatz' class removed/processed correctly")


if __name__ == "__main__":
    test_tagesschau()
