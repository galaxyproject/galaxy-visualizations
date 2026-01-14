"""Completions provider abstractions for LLM integration.

This module provides protocol and implementations for LLM completion providers,
allowing flexible integration with different LLM backends.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Protocol

from .completions import completions_post
from .rate_limiter import TokenBucketRateLimiter

# Type aliases for clarity
TranscriptMessage = Dict[str, Any]
CompletionsMessage = Dict[str, str]
CompletionsReply = Dict[str, Any]


class CompletionsProvider(Protocol):
    """Protocol for LLM completion providers.

    This abstraction allows injecting different LLM implementations
    for testing or using different providers.
    """

    async def complete(
        self,
        transcripts: List[TranscriptMessage],
        tools: List[Dict[str, Any]],
        parallel_tools: bool = False,
    ) -> Optional[CompletionsReply]:
        """Send a completion request with tools.

        Args:
            transcripts: The conversation history.
            tools: List of tool definitions.
            parallel_tools: If True, allow LLM to call multiple tools in one response.

        Returns:
            The LLM response containing tool calls, or None if no response.
        """
        ...


class DefaultCompletionsProvider:
    """Default implementation using the core completions module."""

    def __init__(self, config: Dict[str, Any]):
        """Initialize with configuration.

        Args:
            config: Dictionary containing:
                - ai_api_key: API key for the LLM service
                - ai_base_url: Base URL for the LLM API
                - ai_model: Model identifier to use
        """
        self.ai_api_key = config.get("ai_api_key")
        self.ai_base_url = config.get("ai_base_url")
        self.ai_model = config.get("ai_model")

    async def complete(
        self,
        transcripts: List[TranscriptMessage],
        tools: List[Dict[str, Any]],
        parallel_tools: bool = False,
    ) -> Optional[CompletionsReply]:
        return await completions_post(
            dict(
                ai_base_url=self.ai_base_url,
                ai_api_key=self.ai_api_key,
                ai_model=self.ai_model,
                messages=sanitize_transcripts(transcripts),
                tools=tools,
                parallel_tools=parallel_tools,
            )
        )


class RateLimitedCompletionsProvider:
    """Wrapper that adds rate limiting to any CompletionsProvider."""

    def __init__(self, inner: CompletionsProvider, rate_limit: int):
        """Initialize with an inner provider and rate limit.

        Args:
            inner: The provider to wrap.
            rate_limit: Maximum requests per minute.
        """
        self.inner = inner
        self.limiter = TokenBucketRateLimiter.from_requests_per_minute(rate_limit)

    async def complete(
        self,
        transcripts: List[TranscriptMessage],
        tools: List[Dict[str, Any]],
        parallel_tools: bool = False,
    ) -> Optional[CompletionsReply]:
        await self.limiter.acquire()
        return await self.inner.complete(transcripts, tools, parallel_tools)


def sanitize_transcripts(
    transcripts: List[TranscriptMessage],
) -> List[CompletionsMessage]:
    """Convert transcripts to completion message format.

    Filters out messages without valid string content and extracts
    only the role and content fields needed for the completions API.

    Args:
        transcripts: List of transcript messages with various fields.

    Returns:
        List of sanitized messages with only role and content.
    """
    sanitized: List[CompletionsMessage] = []
    for t in transcripts:
        content = t.get("content")
        if isinstance(content, str) and content:
            sanitized.append(
                {
                    "role": t.get("role", ""),
                    "content": content,
                }
            )
    return sanitized


__all__ = [
    "CompletionsProvider",
    "DefaultCompletionsProvider",
    "RateLimitedCompletionsProvider",
    "sanitize_transcripts",
]
