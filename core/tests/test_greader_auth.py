import datetime

from django.contrib.auth.models import User
from django.utils import timezone

import pytest

from core.models import GReaderAuthToken


@pytest.mark.django_db
class TestGReaderAuthToken:
    @pytest.fixture
    def user(self):
        return User.objects.create_user(username="testuser", password="password")

    def test_create_token(self, user):
        token = GReaderAuthToken.objects.create(user=user, token="somehash")
        assert token.user == user
        assert token.created_at is not None

    def test_is_valid(self, user):
        token = GReaderAuthToken.objects.create(
            user=user,
            token="validhash",
            expires_at=timezone.now() + datetime.timedelta(days=7),
        )
        assert token.is_valid() is True

    def test_is_invalid_when_expired(self, user):
        token = GReaderAuthToken.objects.create(
            user=user,
            token="expiredhash",
            expires_at=timezone.now() - datetime.timedelta(days=1),
        )
        assert token.is_valid() is False

    def test_generate_for_user(self, user):
        token = GReaderAuthToken.generate_for_user(user)
        assert token.user == user
        assert len(token.token) == 64
        assert token.is_valid() is True
        assert token.expires_at is not None
