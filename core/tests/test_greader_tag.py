from django.contrib.auth.models import User
from django.urls import reverse

import pytest

from core.models import FeedGroup, GReaderAuthToken


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
