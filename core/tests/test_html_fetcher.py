from unittest.mock import MagicMock, patch

import pytest
import requests

from core.aggregators.utils.html_fetcher import fetch_html


class TestHtmlFetcher:
    @patch("core.aggregators.utils.html_fetcher.requests.get")
    def test_fetch_html_success(self, mock_get):
        mock_response = MagicMock()
        mock_response.text = "<html>Content</html>"
        mock_response.raise_for_status.return_value = None
        mock_get.return_value = mock_response

        result = fetch_html("https://example.com")

        assert result == "<html>Content</html>"
        mock_get.assert_called_once()
        # Verify headers
        args, kwargs = mock_get.call_args
        assert "User-Agent" in kwargs["headers"]
        assert "YanaBot" in kwargs["headers"]["User-Agent"]

    @patch("core.aggregators.utils.html_fetcher.requests.get")
    @patch("core.aggregators.utils.html_fetcher.time.sleep")
    def test_fetch_html_retry_success(self, mock_sleep, mock_get):
        # Fail first, succeed second
        fail_response = MagicMock()
        fail_response.raise_for_status.side_effect = requests.RequestException("Fail")

        success_response = MagicMock()
        success_response.text = "Success"
        success_response.raise_for_status.return_value = None

        mock_get.side_effect = [requests.RequestException("Fail"), success_response]

        # Relies on default retries=3
        result = fetch_html("https://example.com")

        assert result == "Success"
        assert mock_get.call_count == 2
        assert mock_sleep.call_count == 1
        mock_sleep.assert_called_with(1)  # 2**0

    @patch("core.aggregators.utils.html_fetcher.requests.get")
    @patch("core.aggregators.utils.html_fetcher.time.sleep")
    def test_fetch_html_max_retries_exceeded(self, mock_sleep, mock_get):
        mock_get.side_effect = requests.RequestException("Persistent Fail")

        with pytest.raises(requests.RequestException, match="Persistent Fail"):
            fetch_html("https://example.com")

        assert mock_get.call_count == 3
        assert mock_sleep.call_count == 2

    @patch("core.aggregators.utils.html_fetcher.requests.get")
    @patch("core.aggregators.utils.html_fetcher.time.sleep")
    def test_fetch_html_timeout(self, mock_sleep, mock_get):
        # Mock sleep to avoid waiting during test
        mock_get.side_effect = requests.exceptions.Timeout("Timeout")

        with pytest.raises(requests.exceptions.Timeout):
            fetch_html("https://example.com")

        # Should try 3 times
        assert mock_get.call_count == 3
        assert mock_sleep.call_count == 2
