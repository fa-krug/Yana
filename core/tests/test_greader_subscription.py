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
