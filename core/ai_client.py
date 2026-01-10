import logging
from typing import Optional

import requests

logger = logging.getLogger(__name__)


class AIClient:
    def __init__(self, settings):
        self.settings = settings
        self.provider = settings.active_ai_provider

    def generate_response(self, prompt: str) -> Optional[str]:
        """
        Generate a response from the active AI provider.
        Returns the generated text or None if the call fails.
        """
        if not self.provider:
            logger.warning("No AI provider selected.")
            return None

        try:
            if self.provider == "openai":
                return self._call_openai(prompt)
            elif self.provider == "anthropic":
                return self._call_anthropic(prompt)
            elif self.provider == "gemini":
                return self._call_gemini(prompt)
            else:
                logger.error(f"Unknown AI provider: {self.provider}")
                return None
        except Exception as e:
            logger.error(f"AI API call failed: {e}")
            return None

    def _call_openai(self, prompt: str) -> Optional[str]:
        if not self.settings.openai_enabled or not self.settings.openai_api_key:
            logger.warning("OpenAI is not enabled or configured.")
            return None

        url = f"{self.settings.openai_api_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.settings.openai_api_key}",
            "Content-Type": "application/json",
        }

        data = {
            "model": self.settings.openai_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": self.settings.ai_temperature,
            "max_tokens": self.settings.ai_max_tokens,
        }

        try:
            response = requests.post(
                url, headers=headers, json=data, timeout=self.settings.ai_request_timeout
            )
            response.raise_for_status()
            result = response.json()
            return result["choices"][0]["message"]["content"]
        except requests.exceptions.RequestException as e:
            logger.error(f"OpenAI Request Error: {e}")
            if response is not None:
                logger.error(f"Response: {response.text}")
            raise

    def _call_anthropic(self, prompt: str) -> Optional[str]:
        if not self.settings.anthropic_enabled or not self.settings.anthropic_api_key:
            logger.warning("Anthropic is not enabled or configured.")
            return None

        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": self.settings.anthropic_api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }

        data = {
            "model": self.settings.anthropic_model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": self.settings.ai_max_tokens,
            "temperature": self.settings.ai_temperature,
        }

        try:
            response = requests.post(
                url, headers=headers, json=data, timeout=self.settings.ai_request_timeout
            )
            response.raise_for_status()
            result = response.json()
            return result["content"][0]["text"]
        except requests.exceptions.RequestException as e:
            logger.error(f"Anthropic Request Error: {e}")
            if response is not None:
                logger.error(f"Response: {response.text}")
            raise

    def _call_gemini(self, prompt: str) -> Optional[str]:
        if not self.settings.gemini_enabled or not self.settings.gemini_api_key:
            logger.warning("Gemini is not enabled or configured.")
            return None

        model = self.settings.gemini_model
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={self.settings.gemini_api_key}"
        headers = {
            "Content-Type": "application/json",
        }

        data = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": self.settings.ai_temperature,
                "maxOutputTokens": self.settings.ai_max_tokens,
            },
        }

        try:
            response = requests.post(
                url, headers=headers, json=data, timeout=self.settings.ai_request_timeout
            )
            response.raise_for_status()
            result = response.json()
            # Gemini response structure can vary, handle basic case
            try:
                return result["candidates"][0]["content"]["parts"][0]["text"]
            except (KeyError, IndexError) as err:
                logger.error(f"Unexpected Gemini response format: {result}")
                raise ValueError("Unexpected Gemini response format") from err
        except requests.exceptions.RequestException as e:
            logger.error(f"Gemini Request Error: {e}")
            if response is not None:
                logger.error(f"Response: {response.text}")
            raise
