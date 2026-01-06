from django.contrib.auth.models import User
from django.urls import reverse

import pytest

from core.models import Feed, FeedGroup, GReaderAuthToken


@pytest.mark.django_db
class TestGReaderSubscription:
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
    def subscription_list_url(self):
        return reverse("greader:subscription_list")

    def test_subscription_list_unauthorized(self, client, subscription_list_url):
        response = client.get(subscription_list_url)
        assert response.status_code == 401

    def test_subscription_list_empty(self, client, user, auth_headers, subscription_list_url):
        response = client.get(subscription_list_url, **auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "subscriptions" in data
        assert len(data["subscriptions"]) == 0

    def test_subscription_list_basic(self, client, user, auth_headers, subscription_list_url):
        # Create a standard feed
        feed = Feed.objects.create(
            name="Test Feed",
            aggregator="feed_content",
            identifier="https://example.com/rss",
            user=user,
            enabled=True,
        )

        response = client.get(subscription_list_url, **auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data["subscriptions"]) == 1

        sub = data["subscriptions"][0]
        assert sub["id"] == f"feed/{feed.id}"
        assert sub["title"] == "Test Feed"
        assert sub["url"] == "https://example.com/rss"
        assert sub["htmlUrl"] == "https://example.com"

    def test_subscription_list_with_group(self, client, user, auth_headers, subscription_list_url):
        group = FeedGroup.objects.create(name="Tech", user=user)
        Feed.objects.create(
            name="Tech Feed",
            aggregator="feed_content",
            identifier="https://tech.com/rss",
            user=user,
            group=group,
            enabled=True,
        )

        response = client.get(subscription_list_url, **auth_headers)
        assert response.status_code == 200
        data = response.json()

        sub = data["subscriptions"][0]
        assert len(sub["categories"]) == 1
        assert sub["categories"][0]["id"] == "user/-/label/Tech"
        assert sub["categories"][0]["label"] == "Tech"

    def test_subscription_list_special_types(
        self, client, user, auth_headers, subscription_list_url
    ):
        # Reddit feed
        Feed.objects.create(
            name="Reddit Python",
            aggregator="reddit",
            identifier="r/Python",
            user=user,
            enabled=True,
        )

        response = client.get(subscription_list_url, **auth_headers)
        assert response.status_code == 200
        data = response.json()

        sub = data["subscriptions"][0]
        # Check for auto-added category for Reddit
        category_ids = [c["id"] for c in sub["categories"]]
        assert "user/-/label/Reddit" in category_ids
        assert sub["url"] == "https://www.reddit.com/r/Python"
        assert sub["htmlUrl"] == "https://reddit.com/r/Python"

    def test_subscription_edit_unsubscribe(self, client, user, auth_headers):
        feed = Feed.objects.create(
            name="To Unsubscribe",
            aggregator="feed_content",
            identifier="https://example.com/feed",
            user=user,
            enabled=True,
        )
        url = reverse("greader:subscription_edit")
        data = {"s": f"feed/{feed.id}", "ac": "unsubscribe"}

        response = client.post(url, data, **auth_headers)
        assert response.status_code == 200
        assert response.content == b"OK"

        feed.refresh_from_db()
        assert not feed.enabled

    def test_subscription_edit_subscribe_new_url(self, client, user, auth_headers):
        url = reverse("greader:subscription_edit")
        feed_url = "https://newsite.com/rss"
        data = {"s": f"feed/{feed_url}", "ac": "subscribe", "t": "New Feed"}

        response = client.post(url, data, **auth_headers)
        assert response.status_code == 200
        assert response.content == b"OK"

        # Verify feed created
        assert Feed.objects.filter(identifier=feed_url, user=user).exists()
        feed = Feed.objects.get(identifier=feed_url, user=user)
        assert feed.enabled
        assert feed.name == "New Feed"

    def test_subscription_edit_rename(self, client, user, auth_headers):
        feed = Feed.objects.create(
            name="Old Name",
            aggregator="rss",
            identifier="https://example.com/rename",
            user=user,
            enabled=True,
        )
        url = reverse("greader:subscription_edit")
        data = {"s": f"feed/{feed.id}", "ac": "edit", "t": "New Name"}

        response = client.post(url, data, **auth_headers)
        assert response.status_code == 200
        assert response.content == b"OK"

        feed.refresh_from_db()
        assert feed.name == "New Name"

    def test_subscription_edit_add_label(self, client, user, auth_headers):
        feed = Feed.objects.create(
            name="Label Feed",
            aggregator="rss",
            identifier="https://example.com/label",
            user=user,
            enabled=True,
        )
        url = reverse("greader:subscription_edit")
        data = {"s": f"feed/{feed.id}", "ac": "edit", "a": "user/-/label/MyLabel"}

        response = client.post(url, data, **auth_headers)
        assert response.status_code == 200

        feed.refresh_from_db()
        assert feed.group
        assert feed.group.name == "MyLabel"

    def test_subscription_edit_remove_label(self, client, user, auth_headers):
        group = FeedGroup.objects.create(name="OldLabel", user=user)
        feed = Feed.objects.create(
            name="Remove Label Feed",
            aggregator="rss",
            identifier="https://example.com/remove",
            user=user,
            enabled=True,
            group=group,
        )
        url = reverse("greader:subscription_edit")
        data = {"s": f"feed/{feed.id}", "ac": "edit", "r": "user/-/label/OldLabel"}

        response = client.post(url, data, **auth_headers)
        assert response.status_code == 200

        feed.refresh_from_db()
        assert feed.group is None

    def test_subscription_edit_invalid_id(self, client, user, auth_headers):
        url = reverse("greader:subscription_edit")
        data = {"s": "feed/99999", "ac": "edit", "t": "Try Rename"}

        response = client.post(url, data, **auth_headers)
        assert response.status_code == 400
        assert b"Feed not found" in response.content

    def test_subscription_edit_unsubscribe_other_user(self, client, user, auth_headers):
        other_user = User.objects.create_user("other", "other@example.com", "password")
        feed = Feed.objects.create(
            name="Other Feed",
            aggregator="rss",
            identifier="https://example.com/other",
            user=other_user,
            enabled=True,
        )
        url = reverse("greader:subscription_edit")
        data = {"s": f"feed/{feed.id}", "ac": "unsubscribe"}

        response = client.post(url, data, **auth_headers)
        assert response.status_code == 403
        assert b"Cannot modify other users' feeds" in response.content

    def test_quickadd_success(self, client, user, auth_headers):
        url = reverse("greader:quickadd")
        feed_url = "http://example.com/quick"
        data = {"quickadd": feed_url}

        response = client.post(url, data, **auth_headers)
        assert response.status_code == 200
        result = response.json()

        feed = Feed.objects.get(identifier=feed_url)
        assert result["numResults"] == 1
        assert result["query"] == feed_url
        assert result["streamId"] == f"feed/{feed.id}"
        assert result["streamName"] == feed.name

    def test_quickadd_with_prefix(self, client, user, auth_headers):
        url = reverse("greader:quickadd")
        feed_url = "http://example.com/prefix"
        input_url = f"feed/{feed_url}"
        data = {"quickadd": input_url}

        response = client.post(url, data, **auth_headers)
        assert response.status_code == 200
        result = response.json()

        feed = Feed.objects.get(identifier=feed_url)
        assert result["numResults"] == 1
        assert result["query"] == input_url
        assert result["streamId"] == f"feed/{feed.id}"
        assert result["streamName"] == feed.name
