import datetime

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone

from core.models import GReaderAuthToken


class GReaderAuthTokenTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="password")

    def test_create_token(self):
        token = GReaderAuthToken.objects.create(user=self.user, token="somehash")
        self.assertEqual(token.user, self.user)
        self.assertIsNotNone(token.created_at)

    def test_is_valid(self):
        token = GReaderAuthToken.objects.create(
            user=self.user,
            token="validhash",
            expires_at=timezone.now() + datetime.timedelta(days=7),
        )
        # This will fail as is_valid() is not implemented
        self.assertTrue(token.is_valid())

    def test_is_invalid_when_expired(self):
        token = GReaderAuthToken.objects.create(
            user=self.user,
            token="expiredhash",
            expires_at=timezone.now() - datetime.timedelta(days=1),
        )
        # This will fail as is_valid() is not implemented
        self.assertFalse(token.is_valid())

    def test_generate_for_user(self):
        token = GReaderAuthToken.generate_for_user(self.user)
        self.assertEqual(token.user, self.user)
        self.assertEqual(len(token.token), 64)
        self.assertTrue(token.is_valid())
        self.assertIsNotNone(token.expires_at)
