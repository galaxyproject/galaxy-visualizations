"""HTTP client with automatic retry and environment detection.

Provides adaptive HTTP client that works in both browser (Pyodide) and
server environments with built-in retry logic for transient failures.
"""

import asyncio
import json
import logging
from typing import Any, Awaitable, Callable, TypeVar

from .exceptions import HttpError

logger = logging.getLogger(__name__)

# Retry configuration
RETRY_STATUS_CODES = {429, 500, 502, 503, 504}
MAX_RETRIES = 3
INITIAL_BACKOFF = 1.0  # seconds

T = TypeVar("T")


async def _retry_request(
    request_fn: Callable[[], Awaitable[tuple[int, str, T | None]]],
    url: str,
    method: str,
) -> T:
    """Execute HTTP request with retry logic for transient failures.

    Args:
        request_fn: Async function that returns (status_code, response_text, parsed_data).
                   parsed_data is None if request failed.
        url: Request URL (for error context)
        method: HTTP method (for error context)

    Returns:
        Parsed response data on success

    Raises:
        HttpError: On non-retryable error or after all retries exhausted
    """
    last_error: HttpError | None = None

    for attempt in range(MAX_RETRIES):
        status, text, data = await request_fn()

        # Success
        if data is not None:
            return data

        # Non-retryable error
        if status not in RETRY_STATUS_CODES:
            raise HttpError(
                f"HTTP {status}: {text}",
                status_code=status,
                details={"url": url, "method": method},
            )

        # Retryable error - store and possibly retry
        last_error = HttpError(
            f"HTTP {status}: {text}",
            status_code=status,
            details={"url": url, "method": method},
        )

        if attempt < MAX_RETRIES - 1:
            backoff = INITIAL_BACKOFF * (2**attempt)
            logger.warning(
                f"HTTP {status}, retrying in {backoff}s (attempt {attempt + 1}/{MAX_RETRIES})"
            )
            await asyncio.sleep(backoff)

    # All retries exhausted
    if last_error is None:
        # This should never happen since MAX_RETRIES >= 1
        raise HttpError(
            "Request failed with no error captured",
            status_code=0,
            details={"url": url, "method": method},
        )
    raise last_error


class HttpClient:
    """Base HTTP client interface."""

    async def request(
        self, method: str, url: str, headers: dict[str, str] | None = None, body: Any = None
    ) -> Any:
        raise NotImplementedError


def is_pyodide() -> bool:
    """Check if running in Pyodide (browser) environment."""
    try:
        import pyodide_js  # type: ignore[import-not-found]  # noqa: F401

        return True
    except ImportError:
        return False


async def _parse_response(response: Any) -> Any:
    """Parse response without relying on content type."""
    text = await response.text()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text


# ----------------------------
# Browser / Pyodide client
# ----------------------------


class BrowserHttpClient(HttpClient):
    """HTTP client for browser/Pyodide environment using fetch API."""

    def __init__(self) -> None:
        from js import fetch  # type: ignore[import-not-found]
        from pyodide.ffi import to_js  # type: ignore[import-not-found]

        self._fetch = fetch
        self._to_js = to_js

    async def request(
        self, method: str, url: str, headers: dict[str, str] | None = None, body: Any = None
    ) -> Any:
        headers = headers or {}
        options: dict[str, Any] = {
            "method": method.upper(),
            "headers": headers,
        }
        if body is not None:
            options["body"] = json.dumps(body)
            headers.setdefault("Content-Type", "application/json")

        async def do_request() -> tuple[int, str, Any | None]:
            response = await self._fetch(url, self._to_js(options))
            if response.ok:
                data = await _parse_response(response)
                return response.status, "", data
            text = await response.text()
            return response.status, text, None

        return await _retry_request(do_request, url, method)


# ----------------------------
# Server / Backend client
# ----------------------------


class ServerHttpClient(HttpClient):
    """HTTP client for server environment using aiohttp."""

    def __init__(self) -> None:
        import aiohttp

        self._aiohttp = aiohttp

    async def request(
        self, method: str, url: str, headers: dict[str, str] | None = None, body: Any = None
    ) -> Any:
        data = None
        if body is not None:
            data = json.dumps(body)
            headers = headers or {}
            headers.setdefault("Content-Type", "application/json")

        async def do_request() -> tuple[int, str, Any | None]:
            async with self._aiohttp.ClientSession() as session:
                async with session.request(
                    method=method.upper(),
                    url=url,
                    headers=headers,
                    data=data,
                ) as response:
                    if response.status < 400:
                        parsed = await _parse_response(response)
                        return response.status, "", parsed
                    text = await response.text()
                    return response.status, text, None

        return await _retry_request(do_request, url, method)


# ----------------------------
# Export single implementation
# ----------------------------

http: HttpClient
if is_pyodide():
    http = BrowserHttpClient()
else:
    http = ServerHttpClient()


__all__ = ["http", "HttpClient"]
