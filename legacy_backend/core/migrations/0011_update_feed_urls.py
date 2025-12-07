# Generated migration to update feed URLs

from django.db import migrations


def update_feed_urls(apps, schema_editor):
    """Update feed URLs to use correct endpoints."""
    Feed = apps.get_model("core", "Feed")

    # Mapping of old URLs to new URLs
    url_updates = {
        "https://explosm.net/rss": "https://explosm.net/rss.xml",
        "http://www.darklegacycomics.com/feed": "https://darklegacycomics.com/feed.xml",
        "https://www.heise.de/rss/heise-atom.xml": "https://www.heise.de/rss/heise.rdf",
        "https://www.mactechnews.de/rss.xml": "https://www.mactechnews.de/Rss/News.x",
    }

    # Update each feed with the old URL to the new URL
    for old_url, new_url in url_updates.items():
        Feed.objects.filter(url=old_url).update(url=new_url)


def reverse_update_feed_urls(apps, schema_editor):
    """Reverse the URL updates if needed."""
    Feed = apps.get_model("core", "Feed")

    # Reverse mapping
    url_updates = {
        "https://explosm.net/rss.xml": "https://explosm.net/rss",
        "https://darklegacycomics.com/feed.xml": "http://www.darklegacycomics.com/feed",
        "https://www.heise.de/rss/heise.rdf": "https://www.heise.de/rss/heise-atom.xml",
        "https://www.mactechnews.de/Rss/News.x": "https://www.mactechnews.de/rss.xml",
    }

    # Update each feed with the new URL back to the old URL
    for new_url, old_url in url_updates.items():
        Feed.objects.filter(url=new_url).update(url=old_url)


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0010_add_aggregator_options"),
    ]

    operations = [
        migrations.RunPython(update_feed_urls, reverse_update_feed_urls),
    ]
