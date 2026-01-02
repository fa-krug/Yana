import pytest
from django.contrib.auth.models import User
from django.urls import reverse

from core.models import Article, Feed, FeedGroup, GReaderAuthToken


@pytest.mark.django_db
class TestGReaderTag:
    @pytest.fixture
    def user(self):
        return User.objects.create_user(
            username="testuser", email="test@example.com", password="password"
        )

    @pytest.fixture
    def auth_headers(self, user):
        token = GReaderAuthToken.generate_for_user(user)
        return {"HTTP_AUTHORIZATION": f"GoogleLogin auth={token.token}"}

    @pytest.fixture
    def tag_list_url(self):
        return reverse("greader:tag_list")

    def test_tag_list_unauthorized(self, client, tag_list_url):
        response = client.get(tag_list_url)
        assert response.status_code == 401

    def test_tag_list_default_tags(self, client, user, auth_headers, tag_list_url):
        response = client.get(tag_list_url, **auth_headers)
        assert response.status_code == 200
        data = response.json()

        # Check structure
        assert "tags" in data
        tags = data["tags"]

        # Verify standard tags
        tag_ids = [t["id"] for t in tags]
        assert "user/-/state/com.google/starred" in tag_ids
        assert "user/-/state/com.google/read" in tag_ids
        assert "user/-/state/com.google/reading-list" in tag_ids

    def test_tag_list_with_groups(self, client, user, auth_headers, tag_list_url):
        # Create some groups
        FeedGroup.objects.create(name="Tech", user=user)
        FeedGroup.objects.create(name="News", user=user)

        response = client.get(tag_list_url, **auth_headers)
        assert response.status_code == 200
        data = response.json()
        tags = data["tags"]
        tag_ids = [t["id"] for t in tags]

        # Verify group tags
        assert "user/-/label/Tech" in tag_ids
        assert "user/-/label/News" in tag_ids

    @pytest.fixture
    def feed(self, user):
        return Feed.objects.create(
            name="Test Feed",
            aggregator="rss",
            identifier="https://example.com/rss",
            user=user,
            enabled=True
        )

    @pytest.fixture
    def article(self, feed):
        return Article.objects.create(
            feed=feed,
            name="Test Article",
            identifier="test-id",
            content="Some content",
            read=False,
            starred=False
        )

    @pytest.fixture
    def edit_tag_url(self):
        return reverse("greader:edit_tag")

    def test_edit_tag_mark_read(self, client, user, auth_headers, edit_tag_url, article):
        response = client.post(
            edit_tag_url,
            {"i": str(article.id), "a": "user/-/state/com.google/read"},
            **auth_headers
        )
        assert response.status_code == 200
        assert response.content == b"OK"
        
        article.refresh_from_db()
        assert article.read

    def test_edit_tag_mark_unread(self, client, user, auth_headers, edit_tag_url, article):
        article.read = True
        article.save()
        
        response = client.post(
            edit_tag_url,
            {"i": str(article.id), "r": "user/-/state/com.google/read"},
            **auth_headers
        )
        assert response.status_code == 200
        
        article.refresh_from_db()
        assert not article.read

    def test_edit_tag_star(self, client, user, auth_headers, edit_tag_url, article):
        response = client.post(
            edit_tag_url,
            {"i": str(article.id), "a": "user/-/state/com.google/starred"},
            **auth_headers
        )
        assert response.status_code == 200
        
        article.refresh_from_db()
        assert article.starred

    def test_edit_tag_unstar(self, client, user, auth_headers, edit_tag_url, article):
        article.starred = True
        article.save()
        
        response = client.post(
            edit_tag_url,
            {"i": str(article.id), "r": "user/-/state/com.google/starred"},
            **auth_headers
        )
        assert response.status_code == 200
        
        article.refresh_from_db()
        assert not article.starred

    def test_edit_tag_multiple_items(self, client, user, auth_headers, edit_tag_url, feed):
        a1 = Article.objects.create(feed=feed, name="A1", identifier="id1")
        a2 = Article.objects.create(feed=feed, name="A2", identifier="id2")
        
        # Mark both as starred
        # Use query string for multiple 'i' if needed, but POST data works with list in django client
        response = client.post(
            edit_tag_url,
            {"i": [str(a1.id), str(a2.id)], "a": "user/-/state/com.google/starred"},
            **auth_headers
        )
        assert response.status_code == 200
        
        a1.refresh_from_db()
        a2.refresh_from_db()
        assert a1.starred
        assert a2.starred

    def test_edit_tag_inaccessible_article(self, client, user, auth_headers, edit_tag_url):
        from django.contrib.auth.models import User
        
        other_user = User.objects.create_user("other2", "other2@example.com", "password")
        other_feed = Feed.objects.create(
            name="Other Feed", 
            aggregator="rss", 
            identifier="other", 
            user=other_user,
            enabled=True
        )
        other_article = Article.objects.create(feed=other_feed, name="Other Art", identifier="oa")
        
        response = client.post(
            edit_tag_url,
            {"i": str(other_article.id), "a": "user/-/state/com.google/starred"},
            **auth_headers
        )
        assert response.status_code == 400
        assert b"No accessible articles found" in response.content

    @pytest.fixture
    def mark_all_url(self):
        return reverse("greader:mark_all_as_read")

    def test_mark_all_as_read_global(self, client, user, auth_headers, mark_all_url, feed):
        Article.objects.create(feed=feed, name="A1", identifier="id1", read=False)
        Article.objects.create(feed=feed, name="A2", identifier="id2", read=False)
        
        response = client.post(
            mark_all_url,
            {"s": "user/-/state/com.google/reading-list"},
            **auth_headers
        )
        assert response.status_code == 200
        assert response.content == b"OK"
        
        assert not Article.objects.filter(feed=feed, read=False).exists()

    def test_mark_all_as_read_feed(self, client, user, auth_headers, mark_all_url, feed):
        a1 = Article.objects.create(feed=feed, name="A1", identifier="id1", read=False)
        
        # Another feed
        other_feed = Feed.objects.create(name="F2", aggregator="rss", identifier="f2", user=user, enabled=True)
        a2 = Article.objects.create(feed=other_feed, name="A2", identifier="id2", read=False)
        
        response = client.post(
            mark_all_url,
            {"s": f"feed/{feed.id}"},
            **auth_headers
        )
        assert response.status_code == 200
        
        a1.refresh_from_db()
        a2.refresh_from_db()
        assert a1.read
        assert not a2.read

    def test_mark_all_as_read_timestamp(self, client, user, auth_headers, mark_all_url, feed):
        from datetime import datetime, timedelta, timezone
        now = datetime.now(timezone.utc)
        
        a1 = Article.objects.create(feed=feed, name="New", identifier="n", date=now, read=False)
        a2 = Article.objects.create(feed=feed, name="Old", identifier="o", date=now - timedelta(days=1), read=False)
        
        # Mark older than 1 hour ago as read
        ts = int((now - timedelta(hours=1)).timestamp())
        
        response = client.post(
            mark_all_url,
            {"s": "user/-/state/com.google/reading-list", "ts": str(ts)},
            **auth_headers
        )
        assert response.status_code == 200
        
        a1.refresh_from_db()
        a2.refresh_from_db()
        assert not a1.read
        assert a2.read




