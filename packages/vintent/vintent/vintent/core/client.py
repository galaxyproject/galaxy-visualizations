import asyncio
import json
import logging

from .exceptions import HttpError

logger = logging.getLogger(__name__)

# Retry configuration
RETRY_STATUS_CODES = {429, 500, 502, 503, 504}
MAX_RETRIES = 3
INITIAL_BACKOFF = 1.0  # seconds


class HttpClient:
    async def request(self, method, url, headers=None, body=None):
        raise NotImplementedError


def is_pyodide():
    try:
        import pyodide_js  # noqa: F401

        return True
    except Exception:
        return False


# parse response without relying on content type
async def parse_response(response):
    text = await response.text()
    try:
        return json.loads(text)
    except Exception:
        return text


# ----------------------------
# Browser / Pyodide client
# ----------------------------


class BrowserHttpClient(HttpClient):
    def __init__(self):
        from js import fetch
        from pyodide.ffi import to_js

        self._fetch = fetch
        self._to_js = to_js

    async def request(self, method, url, headers=None, body=None):
        headers = headers or {}
        options = {
            "method": method.upper(),
            "headers": headers,
        }
        if body is not None:
            options["body"] = json.dumps(body)
            headers.setdefault("Content-Type", "application/json")

        last_error = None
        for attempt in range(MAX_RETRIES):
            response = await self._fetch(url, self._to_js(options))
            if response.ok:
                return await parse_response(response)

            status = response.status
            text = await response.text()

            if status not in RETRY_STATUS_CODES:
                # Don't retry client errors (except 429)
                raise HttpError(
                    f"HTTP {status}: {text}",
                    status_code=status,
                    details={"url": url, "method": method},
                )

            last_error = HttpError(
                f"HTTP {status}: {text}",
                status_code=status,
                details={"url": url, "method": method},
            )

            if attempt < MAX_RETRIES - 1:
                backoff = INITIAL_BACKOFF * (2**attempt)
                logger.warning(f"HTTP {status}, retrying in {backoff}s " f"(attempt {attempt + 1}/{MAX_RETRIES})")
                await asyncio.sleep(backoff)

        raise last_error


# ----------------------------
# Server / Backend client
# ----------------------------


class ServerHttpClient(HttpClient):
    def __init__(self):
        import aiohttp

        self._aiohttp = aiohttp

    async def request(self, method, url, headers=None, body=None):
        data = None
        if body is not None:
            data = json.dumps(body)
            headers = headers or {}
            headers.setdefault("Content-Type", "application/json")

        last_error = None
        for attempt in range(MAX_RETRIES):
            async with self._aiohttp.ClientSession() as session:
                async with session.request(
                    method=method.upper(),
                    url=url,
                    headers=headers,
                    data=data,
                ) as response:
                    if response.status < 400:
                        return await parse_response(response)

                    status = response.status
                    text = await response.text()

                    if status not in RETRY_STATUS_CODES:
                        # Don't retry client errors (except 429)
                        raise HttpError(
                            f"HTTP {status}: {text}",
                            status_code=status,
                            details={"url": url, "method": method},
                        )

                    last_error = HttpError(
                        f"HTTP {status}: {text}",
                        status_code=status,
                        details={"url": url, "method": method},
                    )

            if attempt < MAX_RETRIES - 1:
                backoff = INITIAL_BACKOFF * (2**attempt)
                logger.warning(f"HTTP {status}, retrying in {backoff}s " f"(attempt {attempt + 1}/{MAX_RETRIES})")
                await asyncio.sleep(backoff)

        raise last_error


# ----------------------------
# Export single implementation
# ----------------------------

if is_pyodide():
    http = BrowserHttpClient()
else:
    http = ServerHttpClient()


__all__ = ["http", "HttpClient"]
