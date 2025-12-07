"""
AI service for content processing using OpenAI-compatible APIs.

Provides translation, summarization, and custom prompt processing
with structured JSON output and retry logic.
"""

import json
import logging
import time
from datetime import timedelta
from typing import Any

import requests
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


class AIServiceError(Exception):
    """Base exception for AI service errors."""

    pass


class AIQuotaExceededError(AIServiceError):
    """Raised when user exceeds AI quota."""

    pass


class AIService:
    """
    OpenAI-compatible AI service for content processing.

    Uses structured output (JSON mode) to ensure reliable parsing.
    Implements retry logic with exponential backoff.
    """

    def __init__(self):
        self.api_url = settings.OPENAI_API_URL.rstrip("/")
        self.api_key = settings.OPENAI_API_KEY
        self.model = settings.AI_MODEL
        self.temperature = settings.AI_TEMPERATURE
        self.max_tokens = settings.AI_MAX_TOKENS
        self.timeout = settings.AI_REQUEST_TIMEOUT
        self.max_retries = settings.AI_MAX_RETRIES
        self.retry_delay = settings.AI_RETRY_DELAY

        if not self.api_key:
            raise AIServiceError("OPENAI_API_KEY not configured")

    def _make_request(
        self,
        messages: list[dict[str, str]],
        response_format: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        Make API request with retry logic.

        Args:
            messages: List of message dicts with 'role' and 'content'
            response_format: Optional response format schema

        Returns:
            Parsed JSON response

        Raises:
            AIServiceError: On API error or max retries exceeded
        """
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
        }

        # Add response format if provided (for structured output)
        if response_format:
            payload["response_format"] = response_format

        last_error = None

        for attempt in range(self.max_retries):
            try:
                response = requests.post(
                    f"{self.api_url}/chat/completions",
                    headers=headers,
                    json=payload,
                    timeout=self.timeout,
                )
                response.raise_for_status()

                data = response.json()
                content = data["choices"][0]["message"]["content"]

                # Parse JSON response
                if response_format:
                    return json.loads(content)
                return {"content": content}

            except requests.exceptions.RequestException as e:
                last_error = e
                logger.warning(
                    f"AI request failed (attempt {attempt + 1}/{self.max_retries}): {e}"
                )

                if attempt < self.max_retries - 1:
                    # Exponential backoff
                    delay = self.retry_delay * (2**attempt)
                    time.sleep(delay)
                    continue
                break

            except (KeyError, json.JSONDecodeError) as e:
                last_error = e
                logger.error(f"Failed to parse AI response: {e}")
                break

        raise AIServiceError(
            f"AI request failed after {self.max_retries} retries: {last_error}"
        )

    def translate(
        self, content: str, target_language: str, source_language: str = "auto"
    ) -> str:
        """
        Translate HTML content to target language.

        Args:
            content: HTML content to translate
            target_language: Target language code (e.g., 'en', 'de', 'es')
            source_language: Source language ('auto' to detect)

        Returns:
            Translated HTML content

        Raises:
            AIServiceError: On translation failure
        """
        system_prompt = """You are a professional translator. Translate the provided HTML content to the target language.

CRITICAL RULES:
1. Preserve ALL HTML tags, attributes, and structure exactly
2. Only translate text content within tags
3. Do NOT translate: URLs, code blocks, technical terms, proper nouns
4. Maintain formatting, line breaks, and spacing
5. Return ONLY the translated HTML in the 'translated_html' field"""

        user_prompt = f"""Translate this HTML content to {target_language}:

{content}"""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        # Structured output schema
        response_format = {
            "type": "json_schema",
            "json_schema": {
                "name": "translation_response",
                "strict": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "detected_language": {
                            "type": "string",
                            "description": "Detected source language code",
                        },
                        "translated_html": {
                            "type": "string",
                            "description": "Translated HTML content",
                        },
                    },
                    "required": ["detected_language", "translated_html"],
                    "additionalProperties": False,
                },
            },
        }

        result = self._make_request(messages, response_format)

        logger.info(
            f"Translated content from {result.get('detected_language', 'unknown')} to {target_language}"
        )

        return result["translated_html"]

    def summarize(self, content: str) -> str:
        """
        Generate concise summary of HTML content.

        Args:
            content: HTML content to summarize

        Returns:
            Summary as HTML (bullet points)

        Raises:
            AIServiceError: On summarization failure
        """
        system_prompt = """You are a content summarizer. Create a concise summary of the article.

RULES:
1. Extract 3-5 key points as bullet list
2. Each point should be 1-2 sentences max
3. Focus on main ideas, facts, and conclusions
4. Return HTML formatted list (<ul><li>...</li></ul>)
5. Be objective and factual"""

        user_prompt = f"""Summarize this article:

{content}"""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        response_format = {
            "type": "json_schema",
            "json_schema": {
                "name": "summary_response",
                "strict": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "summary_html": {
                            "type": "string",
                            "description": "Summary as HTML bullet list",
                        }
                    },
                    "required": ["summary_html"],
                    "additionalProperties": False,
                },
            },
        }

        result = self._make_request(messages, response_format)

        logger.info("Generated summary")

        return result["summary_html"]

    def custom_prompt(self, content: str, prompt: str) -> str:
        """
        Process content with custom user prompt.

        Args:
            content: HTML content to process
            prompt: User's custom instruction

        Returns:
            Processed content as HTML

        Raises:
            AIServiceError: On processing failure
        """
        system_prompt = f"""You are a content processor. Follow the user's instruction to process the article.

RULES:
1. Follow the user's instruction exactly
2. Return result as clean HTML
3. Preserve important formatting
4. Be concise and relevant

User Instruction: {prompt}"""

        user_prompt = f"""Process this article:

{content}"""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        response_format = {
            "type": "json_schema",
            "json_schema": {
                "name": "custom_prompt_response",
                "strict": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "processed_html": {
                            "type": "string",
                            "description": "Processed HTML content",
                        }
                    },
                    "required": ["processed_html"],
                    "additionalProperties": False,
                },
            },
        }

        result = self._make_request(messages, response_format)

        logger.info(f"Processed content with custom prompt: {prompt[:50]}...")

        return result["processed_html"]

    def check_quota(self, user) -> None:
        """
        Check if user has remaining AI quota.

        Args:
            user: Django User instance

        Raises:
            AIQuotaExceededError: If quota exceeded
        """
        from core.models import UserAIQuota

        # Get or create quota for user
        quota, created = UserAIQuota.objects.get_or_create(
            user=user,
            defaults={
                "daily_limit": settings.AI_DEFAULT_DAILY_LIMIT,
                "monthly_limit": settings.AI_DEFAULT_MONTHLY_LIMIT,
                "daily_reset_at": (timezone.now() + timedelta(days=1)).replace(
                    hour=0, minute=0, second=0, microsecond=0
                ),
                "monthly_reset_at": (
                    (timezone.now() + timedelta(days=32)).replace(
                        day=1, hour=0, minute=0, second=0, microsecond=0
                    )
                ),
            },
        )

        if not quota.can_use_ai():
            raise AIQuotaExceededError(
                f"AI quota exceeded for user {user.username}: "
                f"{quota.daily_used}/{quota.daily_limit} daily, "
                f"{quota.monthly_used}/{quota.monthly_limit} monthly"
            )

    def increment_quota(self, user) -> None:
        """
        Increment user's AI usage counter.

        Args:
            user: Django User instance
        """
        from core.models import UserAIQuota

        quota = UserAIQuota.objects.get(user=user)
        quota.increment_usage()
