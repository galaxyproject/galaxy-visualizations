"""Retry utilities with exponential backoff."""

import asyncio
import logging
from typing import Awaitable, Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


async def retry_async(
    func: Callable[[], Awaitable[T]],
    max_retries: int = 3,
    initial_backoff: float = 1.0,
    retryable: Callable[[Exception], bool] | None = None,
    on_retry: Callable[[Exception, int, float], None] | None = None,
) -> T:
    """Execute an async function with retry and exponential backoff.

    Args:
        func: Async function to execute (no arguments, use closure for params)
        max_retries: Maximum number of attempts
        initial_backoff: Initial backoff delay in seconds
        retryable: Function to determine if exception is retryable (default: all)
        on_retry: Callback called before each retry with (error, attempt, backoff)

    Returns:
        Result from successful function call

    Raises:
        Exception: Last exception if all retries fail
    """
    last_error: Exception | None = None

    for attempt in range(max_retries):
        try:
            return await func()
        except Exception as e:
            if retryable and not retryable(e):
                raise

            last_error = e

            if attempt < max_retries - 1:
                backoff = initial_backoff * (2**attempt)
                if on_retry:
                    on_retry(e, attempt + 1, backoff)
                await asyncio.sleep(backoff)

    assert last_error is not None
    raise last_error
