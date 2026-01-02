from datetime import datetime, timedelta, timezone

from django.contrib.auth.models import User
from django.urls import reverse

import pytest

from core.models import Article, Feed, GReaderAuthToken


@pytest.mark.django_db
class TestGReaderStreamIds:
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
    def stream_ids_url(self):
        return reverse("greader:stream_items_ids")

    @pytest.fixture
    def feed(self, user):
        return Feed.objects.create(
            name="Test Feed",
            aggregator="rss",
            identifier="https://example.com/rss",
            user=user,
            enabled=True,
        )

    @pytest.fixture
    def articles(self, feed):
        # Create 3 articles
        # Art 1: Newest, Unread
        # Art 2: Middle, Read
        # Art 3: Oldest, Starred

        now = datetime.now(timezone.utc)

        a1 = Article.objects.create(
            feed=feed, name="Article 1", identifier="id1", date=now, read=False
        )
        a2 = Article.objects.create(
            feed=feed, name="Article 2", identifier="id2", date=now - timedelta(hours=1), read=True
        )
        a3 = Article.objects.create(
            feed=feed,
            name="Article 3",
            identifier="id3",
            date=now - timedelta(hours=2),
            read=False,
            starred=True,
        )
        return [a1, a2, a3]

    def test_stream_ids_default(self, client, user, auth_headers, stream_ids_url, articles):
        response = client.get(stream_ids_url, **auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "itemRefs" in data
        ids = [item["id"] for item in data["itemRefs"]]
        assert str(articles[0].id) in ids
        assert str(articles[1].id) in ids
        assert str(articles[2].id) in ids

    def test_stream_ids_feed(self, client, user, auth_headers, stream_ids_url, articles, feed):
        response = client.get(stream_ids_url, {"s": f"feed/{feed.id}"}, **auth_headers)
        assert response.status_code == 200
        data = response.json()
        ids = [item["id"] for item in data["itemRefs"]]
        assert len(ids) == 3

    def test_stream_ids_exclude_read(self, client, user, auth_headers, stream_ids_url, articles):
        response = client.get(
            stream_ids_url, {"xt": "user/-/state/com.google/read"}, **auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        ids = [item["id"] for item in data["itemRefs"]]

        # Article 2 is read, should be excluded
        assert str(articles[0].id) in ids
        assert str(articles[1].id) not in ids
        assert str(articles[2].id) in ids

    def test_stream_ids_include_starred(self, client, user, auth_headers, stream_ids_url, articles):
        response = client.get(
            stream_ids_url, {"it": "user/-/state/com.google/starred"}, **auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        ids = [item["id"] for item in data["itemRefs"]]

        # Article 3 is starred, should be included (others might be excluded depending on logic,
        # but 'it' usually means "AND is starred" on top of stream?
        # Wait, build_filters_for_ids:
        # if include_tag == starred: conditions &= Q(starred=True)
        # So it's an intersection.

        assert str(articles[0].id) not in ids
        assert str(articles[1].id) not in ids
        assert str(articles[2].id) in ids

    def test_stream_ids_older_than(self, client, user, auth_headers, stream_ids_url, articles):
        # Older than 30 mins ago (excludes Article 1)
        older_than = int((datetime.now(timezone.utc) - timedelta(minutes=30)).timestamp())

        response = client.get(stream_ids_url, {"ot": str(older_than)}, **auth_headers)
        assert response.status_code == 200
        data = response.json()
        ids = [item["id"] for item in data["itemRefs"]]

        assert str(articles[0].id) not in ids
        assert str(articles[1].id) in ids
        assert str(articles[2].id) in ids

    def test_stream_ids_reverse(self, client, user, auth_headers, stream_ids_url, articles):
        response = client.get(
            stream_ids_url,
            {"r": "o"},  # Oldest first
            **auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        ids = [item["id"] for item in data["itemRefs"]]

        # Expect order: 3, 2, 1
        assert ids[0] == str(articles[2].id)
        assert ids[1] == str(articles[1].id)
        assert ids[2] == str(articles[0].id)
