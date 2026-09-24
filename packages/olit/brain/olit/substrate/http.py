import asyncio
import json
import logging
from datetime import datetime, timezone

from olit.exceptions import HttpError

logger = logging.getLogger(__name__)

# Retry configuration
RETRY_STATUS_CODES = {429, 500, 502, 503, 504}
# A rate limit rejected the request, so resending it repeats nothing.
RATE_LIMITED = 429
# A server error may have been applied before it was reported; only a request whose repeat
# is indistinguishable from its first attempt can be resent on one.
IDEMPOTENT_METHODS = {"GET", "HEAD", "PUT", "DELETE"}
MAX_RETRIES = 3
INITIAL_BACKOFF = 1.0  # seconds
# A rate limiter states how long to wait; guessing shorter guarantees the retry fails.
MAX_RETRY_AFTER = 60.0
RETRY_INFO_TYPE = "type.googleapis.com/google.rpc.RetryInfo"


def retry_after(headers, body):
    """The delay the server asked for, or None; sources ordered by how standard they are."""
    for source in (_retry_after_header, _retry_after_ms_header, _google_retry_info):
        stated = source(headers if source is not _google_retry_info else body)
        if stated is not None:
            return max(0.0, min(stated, MAX_RETRY_AFTER))
    return None


def _header(headers, name):
    """Case-insensitive lookup; header casing is not guaranteed by anyone."""
    if not headers:
        return None
    try:
        for key, value in headers.items():
            if key and key.lower() == name and value:
                return value
    except AttributeError:
        return None
    return None


def _retry_after_header(headers):
    """RFC 9110 `Retry-After`: delta-seconds or an HTTP-date. Both are in the wild."""
    raw = _header(headers, "retry-after")
    if raw is None:
        return None
    raw = str(raw).strip()
    try:
        return float(raw)
    except ValueError:
        pass
    try:
        from email.utils import parsedate_to_datetime

        when = parsedate_to_datetime(raw)
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        return (when - datetime.now(timezone.utc)).total_seconds()
    except Exception:
        return None


def _retry_after_ms_header(headers):
    """OpenAI sends `retry-after-ms` alongside, and sometimes instead of, the seconds form."""
    raw = _header(headers, "retry-after-ms")
    if raw is None:
        return None
    try:
        return float(str(raw).strip()) / 1000.0
    except ValueError:
        return None


def _google_retry_info(body):
    """Google states the delay in a typed RetryInfo detail and sends no header at all."""
    payload = body
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            return None
    if isinstance(payload, list):
        payload = payload[0] if payload else None
    if not isinstance(payload, dict):
        return None
    for detail in (payload.get("error") or {}).get("details") or []:
        if isinstance(detail, dict) and detail.get("@type") == RETRY_INFO_TYPE:
            delay = str(detail.get("retryDelay") or "")
            if delay.endswith("s"):
                try:
                    return float(delay[:-1])
                except ValueError:
                    return None
    return None


def _retryable(status, retry_errors):
    """Whether this status may be resent, given what the caller said about repeating it."""
    if status == RATE_LIMITED:
        return True
    return retry_errors and status in RETRY_STATUS_CODES


class HttpClient:
    """The retry policy. A transport implements `_attempt` and inherits it."""

    async def request(
        self, method, url, headers=None, body=None, signal=None, on_retry=None, binary=False, retry_errors=None
    ):
        """Send the request, resending it only while that is safe and the server allows it.

        `retry_errors` says whether a server error may be resent; by default only an
        idempotent method is. A POST Galaxy already applied would run the job twice.
        """
        method = method.upper()
        if retry_errors is None:
            retry_errors = method in IDEMPOTENT_METHODS

        for attempt in range(MAX_RETRIES):
            result, failure = await self._attempt(method, url, headers, body, signal, binary)
            if failure is None:
                return result

            status, text, response_headers = failure
            error = HttpError(f"HTTP {status}: {text}", status_code=status, details={"url": url, "method": method})
            if not _retryable(status, retry_errors) or attempt == MAX_RETRIES - 1:
                raise error

            stated = retry_after(response_headers, text)
            backoff = stated if stated is not None else INITIAL_BACKOFF * (2**attempt)
            logger.warning("HTTP %s, retrying in %ss (attempt %s/%s)", status, backoff, attempt + 1, MAX_RETRIES)
            _report(on_retry, status, backoff, attempt + 1)
            await asyncio.sleep(backoff)

    async def _attempt(self, method, url, headers, body, signal, binary):
        """One round trip: `(parsed body, None)`, or `(None, (status, text, headers))`."""
        raise NotImplementedError


def _report(on_retry, status, wait, attempt):
    """Tell the caller we are waiting, so a slow turn does not look like a hang."""
    if on_retry is None:
        return
    try:
        on_retry({"status": status, "wait": wait, "attempt": attempt, "of": MAX_RETRIES})
    except Exception:
        logger.debug("retry listener raised", exc_info=True)


def is_pyodide():
    try:
        import pyodide_js  # noqa: F401

        return True
    except ImportError:
        return False


# parse response without relying on content type
async def parse_response(response):
    text = await response.text()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text


async def parse_response_bytes(response):
    """Undecoded bytes. text() would UTF-8 decode, which silently destroys BAM,
    HDF5 and gzip content by replacing invalid sequences."""
    if hasattr(response, "arrayBuffer"):  # browser fetch
        return bytes((await response.arrayBuffer()).to_py())
    return await response.read()  # aiohttp


# ----------------------------


def _js_headers(response):
    """A dict-like view of fetch's Headers, or None when it cannot be read."""
    try:
        return {
            "retry-after": response.headers.get("Retry-After"),
            "retry-after-ms": response.headers.get("retry-after-ms"),
        }
    except Exception:
        return None


class BrowserHttpClient(HttpClient):
    def __init__(self):
        from js import olitFetch as fetch
        from pyodide.ffi import to_js

        self._fetch = fetch
        self._to_js = to_js

    async def _attempt(self, method, url, headers, body, signal, binary):
        headers = dict(headers or {})
        options = {"method": method, "headers": headers, "cache": "no-store", "credentials": "same-origin"}
        if body is not None:
            options["body"] = json.dumps(body)
            headers.setdefault("Content-Type", "application/json")
        # Handed to fetch so Stop drops the request in flight.
        if signal is not None:
            options["signal"] = signal

        response = await self._fetch(url, self._to_js(options))
        if response.ok:
            return await (parse_response_bytes(response) if binary else parse_response(response)), None
        return None, (response.status, await response.text(), _js_headers(response))


# ----------------------------


class ServerHttpClient(HttpClient):
    def __init__(self):
        import aiohttp

        self._aiohttp = aiohttp

    async def _attempt(self, method, url, headers, body, signal, binary):
        # A browser AbortSignal has no meaning here; the loop's own checks still apply.
        del signal
        data = None
        if body is not None:
            data = json.dumps(body)
            headers = dict(headers or {})
            headers.setdefault("Content-Type", "application/json")

        async with self._aiohttp.ClientSession() as session:
            async with session.request(method=method, url=url, headers=headers, data=data) as response:
                if response.status < 400:
                    return await (parse_response_bytes(response) if binary else parse_response(response)), None
                return None, (response.status, await response.text(), dict(response.headers))


# ----------------------------

http: HttpClient
if is_pyodide():
    http = BrowserHttpClient()
else:
    http = ServerHttpClient()


__all__ = ["http", "HttpClient"]
