from django.contrib.auth.models import User
from django.test import Client, TestCase
from django.urls import reverse

from core.models import GReaderAuthToken


class ClientLoginTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            username="testuser", email="test@example.com", password="password"
        )
        self.url = reverse("greader:client_login")

    def test_client_login_success(self):
        response = self.client.post(self.url, {"Email": "test@example.com", "Passwd": "password"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("SID=", response.content.decode())
        self.assertIn("Auth=", response.content.decode())

        # Verify token created
        self.assertTrue(GReaderAuthToken.objects.filter(user=self.user).exists())

    def test_client_login_success_lowercase_params(self):
        response = self.client.post(self.url, {"email": "test@example.com", "passwd": "password"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("Auth=", response.content.decode())

    def test_client_login_failure(self):
        response = self.client.post(
            self.url, {"Email": "test@example.com", "Passwd": "wrongpassword"}
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn("Error=BadAuthentication", response.content.decode())

    def test_client_login_missing_args(self):
        response = self.client.post(self.url, {"Email": "test@example.com"})
        self.assertEqual(response.status_code, 403)
        self.assertIn("Error=BadAuthentication", response.content.decode())

    def test_client_login_invalid_method(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 405)
