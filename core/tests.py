from django.test import TestCase, Client
from django.urls import reverse


class YouTubeProxyViewTests(TestCase):
    """Test suite for YouTube proxy endpoint."""

    def setUp(self):
        """Set up test client."""
        self.client = Client()
        self.endpoint = "/api/youtube-proxy"

    # ==================== Basic Functionality Tests ====================

    def test_valid_video_id_returns_html(self):
        """Test that valid video ID returns HTML page."""
        response = self.client.get(f"{self.endpoint}?v=dQw4w9WgXcQ")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/html")

    def test_response_contains_youtube_embed(self):
        """Test that response contains YouTube embed iframe."""
        response = self.client.get(f"{self.endpoint}?v=dQw4w9WgXcQ")
        self.assertIn(b"youtube-nocookie.com", response.content)
        self.assertIn(b"<iframe", response.content)
        self.assertIn(b"dQw4w9WgXcQ", response.content)

    def test_response_contains_html_structure(self):
        """Test that response has proper HTML structure."""
        response = self.client.get(f"{self.endpoint}?v=dQw4w9WgXcQ")
        self.assertIn(b"<!DOCTYPE html>", response.content)
        self.assertIn(b"<html", response.content)
        self.assertIn(b"</html>", response.content)

    # ==================== Error Handling Tests ====================

    def test_missing_video_id_returns_400(self):
        """Test that missing video ID returns 400 error."""
        response = self.client.get(self.endpoint)
        self.assertEqual(response.status_code, 400)

    def test_empty_video_id_returns_400(self):
        """Test that empty video ID returns 400 error."""
        response = self.client.get(f"{self.endpoint}?v=")
        self.assertEqual(response.status_code, 400)

    def test_error_response_is_html(self):
        """Test that error response is valid HTML."""
        response = self.client.get(self.endpoint)
        self.assertEqual(response["Content-Type"], "text/html")
        self.assertIn(b"Missing video ID", response.content)

    def test_error_page_contains_usage(self):
        """Test that error page shows correct usage."""
        response = self.client.get(self.endpoint)
        self.assertIn(b"?v=VIDEO_ID", response.content)

    # ==================== Query Parameter Tests ====================

    def test_autoplay_parameter(self):
        """Test autoplay parameter is passed to embed URL."""
        response = self.client.get(f"{self.endpoint}?v=dQw4w9WgXcQ&autoplay=1")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"autoplay=1", response.content)

    def test_mute_parameter(self):
        """Test mute parameter is passed to embed URL."""
        response = self.client.get(f"{self.endpoint}?v=dQw4w9WgXcQ&mute=1")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"mute=1", response.content)

    def test_loop_parameter(self):
        """Test loop parameter is passed to embed URL."""
        response = self.client.get(f"{self.endpoint}?v=dQw4w9WgXcQ&loop=1")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"loop=1", response.content)

    def test_loop_includes_playlist(self):
        """Test that loop=1 includes playlist parameter."""
        response = self.client.get(f"{self.endpoint}?v=dQw4w9WgXcQ&loop=1")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"playlist=dQw4w9WgXcQ", response.content)

    def test_controls_parameter(self):
        """Test controls parameter is passed to embed URL."""
        response = self.client.get(f"{self.endpoint}?v=dQw4w9WgXcQ&controls=0")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"controls=0", response.content)

    def test_rel_parameter(self):
        """Test rel parameter is passed to embed URL."""
        response = self.client.get(f"{self.endpoint}?v=dQw4w9WgXcQ&rel=1")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"rel=1", response.content)

    def test_modestbranding_parameter(self):
        """Test modestbranding parameter is passed to embed URL."""
        response = self.client.get(f"{self.endpoint}?v=dQw4w9WgXcQ&modestbranding=0")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"modestbranding=0", response.content)

    def test_playsinline_parameter(self):
        """Test playsinline parameter is passed to embed URL."""
        response = self.client.get(f"{self.endpoint}?v=dQw4w9WgXcQ&playsinline=0")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"playsinline=0", response.content)

    def test_multiple_parameters(self):
        """Test multiple parameters together."""
        response = self.client.get(
            f"{self.endpoint}?v=dQw4w9WgXcQ&autoplay=1&mute=1&controls=0"
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"autoplay=1", response.content)
        self.assertIn(b"mute=1", response.content)
        self.assertIn(b"controls=0", response.content)

    def test_default_parameters(self):
        """Test that default parameters are applied."""
        response = self.client.get(f"{self.endpoint}?v=dQw4w9WgXcQ")
        self.assertEqual(response.status_code, 200)
        # Default values should be in the URL
        self.assertIn(b"autoplay=0", response.content)
        self.assertIn(b"controls=1", response.content)
        self.assertIn(b"modestbranding=1", response.content)
        self.assertIn(b"playsinline=1", response.content)

    # ==================== Security Header Tests ====================

    def test_no_xframe_options_header(self):
        """Test that X-Frame-Options header is NOT present."""
        response = self.client.get(f"{self.endpoint}?v=dQw4w9WgXcQ")
        self.assertNotIn("X-Frame-Options", response)

    def test_error_response_no_xframe_options(self):
        """Test that error responses also don't have X-Frame-Options."""
        response = self.client.get(self.endpoint)
        self.assertNotIn("X-Frame-Options", response)

    def test_content_type_header(self):
        """Test that Content-Type is set correctly."""
        response = self.client.get(f"{self.endpoint}?v=dQw4w9WgXcQ")
        self.assertEqual(response["Content-Type"], "text/html")

    def test_iframe_has_allow_attribute(self):
        """Test that iframe has correct allow attribute."""
        response = self.client.get(f"{self.endpoint}?v=dQw4w9WgXcQ")
        self.assertIn(b'allow="accelerometer; autoplay; clipboard-write', response.content)
        self.assertIn(b"encrypted-media; gyroscope; picture-in-picture", response.content)

    def test_iframe_has_referrerpolicy(self):
        """Test that iframe has referrerpolicy attribute."""
        response = self.client.get(f"{self.endpoint}?v=dQw4w9WgXcQ")
        self.assertIn(b'referrerpolicy="strict-origin-when-cross-origin"', response.content)

    # ==================== HTTP Method Tests ====================

    def test_post_request_not_allowed(self):
        """Test that POST requests are not allowed."""
        response = self.client.post(f"{self.endpoint}?v=dQw4w9WgXcQ")
        self.assertEqual(response.status_code, 405)

    def test_put_request_not_allowed(self):
        """Test that PUT requests are not allowed."""
        response = self.client.put(f"{self.endpoint}?v=dQw4w9WgXcQ")
        self.assertEqual(response.status_code, 405)

    def test_delete_request_not_allowed(self):
        """Test that DELETE requests are not allowed."""
        response = self.client.delete(f"{self.endpoint}?v=dQw4w9WgXcQ")
        self.assertEqual(response.status_code, 405)

    # ==================== Edge Cases ====================

    def test_video_id_with_whitespace_is_stripped(self):
        """Test that whitespace in video ID is stripped."""
        response = self.client.get(f"{self.endpoint}?v=+dQw4w9WgXcQ+")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"dQw4w9WgXcQ", response.content)

    def test_long_video_id(self):
        """Test that long video IDs are handled."""
        video_id = "x" * 100
        response = self.client.get(f"{self.endpoint}?v={video_id}")
        self.assertEqual(response.status_code, 200)
        self.assertIn(video_id.encode(), response.content)

    def test_video_id_with_special_characters(self):
        """Test that video IDs with special characters are handled."""
        # YouTube video IDs use alphanumeric, dash, and underscore
        video_id = "dQw4w9WgXcQ"
        response = self.client.get(f"{self.endpoint}?v={video_id}")
        self.assertEqual(response.status_code, 200)
        self.assertIn(video_id.encode(), response.content)
