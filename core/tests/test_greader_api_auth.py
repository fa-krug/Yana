from django.contrib.auth.models import User
from django.urls import reverse

import pytest

from core.models import GReaderAuthToken


@pytest.mark.django_db
class TestGReaderAPIAuth:
    @pytest.fixture
    def user(self):
        return User.objects.create_user(
            username="testuser", email="test@example.com", password="password"
        )

    @pytest.fixture
    def login_url(self):
        return reverse("greader:client_login")

    @pytest.fixture
    def token_url(self):
        return reverse("greader:token")

    def test_client_login_success(self, client, user, login_url):
        response = client.post(login_url, {"Email": "test@example.com", "Passwd": "password"})
        assert response.status_code == 200
        content = response.content.decode()
        assert "Auth=" in content
        assert "SID=" in content

        # Verify token created in DB
        assert GReaderAuthToken.objects.filter(user=user).count() == 1

    def test_client_login_fail(self, client, user, login_url):
        response = client.post(login_url, {"Email": "test@example.com", "Passwd": "wrongpassword"})
        assert response.status_code == 403
        assert "Error=BadAuthentication" in response.content.decode()

    def test_token_view_success(self, client, user, token_url):
        # First login to get a token
        token = GReaderAuthToken.generate_for_user(user)

        response = client.get(token_url, HTTP_AUTHORIZATION=f"GoogleLogin auth={token.token}")
        assert response.status_code == 200
        assert len(response.content.decode()) == 57

    def test_token_view_unauthorized(self, client, token_url):
        response = client.get(token_url)
        assert response.status_code == 401
