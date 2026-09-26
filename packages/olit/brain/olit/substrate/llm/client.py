"""The `llm`-gated port the loop calls: resolve an endpoint, send, parse."""

import asyncio
import copy
import logging
from dataclasses import replace

from olit.exceptions import ProviderError

from ..http import http
from ..rate_limiter import TokenBucketRateLimiter
from .api import get_adapter
from .providers import resolve

logger = logging.getLogger(__name__)

# One resend for a 200 that carried no usable reply; more would hide a broken endpoint.
EMPTY_REPLY_ATTEMPTS = 2
EMPTY_REPLY_BACKOFF = 2.0


def _report_empty(on_retry, wait, attempt):
    """Announce the wait the way a rate-limit wait is announced, so it is not a silent pause."""
    if on_retry is None:
        return
    try:
        on_retry({"status": 200, "wait": wait, "attempt": attempt, "of": EMPTY_REPLY_ATTEMPTS - 1})
    except Exception:
        logger.debug("retry listener raised", exc_info=True)


class Llm:
    def __init__(self, config, manifest):
        self.config = config
        self.manifest = manifest
        self.target = resolve(config)
        self.adapter = get_adapter(self.target.api)
        # The rate comes from the endpoint; one bucket per session, shared by scoped views.
        self._limiter = TokenBucketRateLimiter.from_requests_per_minute(self.target.rate_limit)
        logger.info(
            "llm target: provider=%s model=%s window=%s max_tokens=%s",
            self.target.provider.id,
            self.target.model.id,
            self.target.context_window,
            self.target.max_tokens,
        )

    async def init(self):
        """Ask the endpoint for its context window, when the provider says to."""
        if not self.target.provider.probe_window or self.config.get("ai_context_window"):
            return self
        window = await _probe_window(self.target.base_url)
        if window:
            self.target = replace(self.target, context_window=window)
            logger.info("probed context window: %d", window)
        return self

    def scoped(self, manifest):
        """A narrower view sharing the same rate limiter, so scoping cannot bypass it."""
        view = copy.copy(self)
        view.manifest = manifest
        return view

    async def complete(
        self,
        messages,
        tools=None,
        tool_choice=None,
        parallel_tools=True,
        cancellation=None,
        on_retry=None,
    ):
        self.manifest.require("llm")
        oversized = self.adapter.oversized_tools(self.target, tools)
        if oversized:
            # This endpoint rejects the whole request, not the offending tool.
            names = ", ".join(f"{name} ({size} bytes)" for name, size in oversized)
            raise ValueError(f"Tool schema too large for {self.target.provider.name}: {names}")
        body = self.adapter.build_request(self.target, messages, tools, tool_choice, parallel_tools)
        for attempt in range(EMPTY_REPLY_ATTEMPTS):
            await self._limiter.acquire()
            payload = await http.request(
                method="POST",
                url=self.adapter.url(self.target),
                headers=self.adapter.headers(self.target),
                body=body,
                signal=cancellation.signal if cancellation else None,
                on_retry=on_retry,
                # A completion that errored produced nothing, so asking again repeats nothing.
                retry_errors=True,
            )
            try:
                return self.adapter.parse_reply(payload)
            except ProviderError:
                # A 200 carrying nothing usable is transport-shaped, so retry here.
                if attempt == EMPTY_REPLY_ATTEMPTS - 1:
                    raise
                logger.warning("empty provider reply, retrying (%d/%d)", attempt + 1, EMPTY_REPLY_ATTEMPTS - 1)
                _report_empty(on_retry, EMPTY_REPLY_BACKOFF, attempt + 1)
                await asyncio.sleep(EMPTY_REPLY_BACKOFF)


async def _probe_window(base_url):
    """llama.cpp's /props; any other server simply does not answer it."""
    if not base_url:
        return None
    root = base_url.rstrip("/").removesuffix("/v1")
    try:
        props = await http.request(method="GET", url=f"{root}/props")
    except Exception:
        logger.debug("context-window probe failed", exc_info=True)
        return None
    settings = (props or {}).get("default_generation_settings") or {}
    window = settings.get("n_ctx")
    return window if isinstance(window, int) and window > 0 else None
