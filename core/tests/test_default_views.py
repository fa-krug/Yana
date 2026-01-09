from unittest.mock import patch

from django.test import Client, TestCase


class TestDefaultViews(TestCase):
    def setUp(self):
        self.client = Client()

    def test_health_check_healthy(self):
        """Test health check returns 200 and healthy status."""
        with patch("django.db.connection.cursor"):
            response = self.client.get("/health/")

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), {"status": "healthy", "database": "connected"})

    def test_health_check_unhealthy(self):
        """Test health check returns 503 when db fails."""
        with patch("django.db.connection.cursor") as mock_cursor:
            mock_cursor.side_effect = Exception("DB Down")

            response = self.client.get("/health/")

            self.assertEqual(response.status_code, 503)
            data = response.json()
            self.assertEqual(data["status"], "unhealthy")
            self.assertEqual(data["error"], "DB Down")

    def test_youtube_proxy_view_missing_id(self):
        """Test proxy view requires video ID."""
        response = self.client.get("/api/youtube-proxy")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Missing video ID", response.content.decode())

    def test_youtube_proxy_view_success(self):
        """Test proxy view returns embed HTML."""
        response = self.client.get("/api/youtube-proxy?v=dQw4w9WgXcQ")
        self.assertEqual(response.status_code, 200)
        content = response.content.decode()
        self.assertIn("youtube-nocookie.com/embed/dQw4w9WgXcQ", content)
        self.assertIn("autoplay=0", content)

    def test_youtube_proxy_view_params(self):
        """Test proxy view passes parameters correctly."""
        url = "/api/youtube-proxy?v=test&autoplay=1&loop=1"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        content = response.content.decode()
        self.assertIn("autoplay=1", content)
        self.assertIn("loop=1", content)
        # Playlist param is added when loop is 1
        self.assertIn("playlist=test", content)
