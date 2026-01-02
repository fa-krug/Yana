import pytest
from django.contrib.auth.models import User
from django.urls import reverse

from core.models import GReaderAuthToken


@pytest.mark.django_db
class TestGReaderPolish:
    @pytest.fixture
    def user(self):
        return User.objects.create_user(
            username="testuser", email="test@example.com", password="password"
        )

    @pytest.fixture
    def auth_headers(self, user):
        token = GReaderAuthToken.generate_for_user(user)
        return {"HTTP_AUTHORIZATION": f"GoogleLogin auth={token.token}"}

    def test_preference_list(self, client, auth_headers):
        url = reverse("greader:preference_list")
        response = client.get(url, **auth_headers)
        assert response.status_code == 200
        assert response.json() == {"prefs": []}

    def test_preference_stream_list(self, client, auth_headers):
        url = reverse("greader:preference_stream_list")
        response = client.get(url, **auth_headers)
        assert response.status_code == 200
        assert response.json() == {"streamprefs": {}}
