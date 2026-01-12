"""Token bucket rate limiter for API request throttling.

This module provides a production-grade rate limiter using the token bucket
algorithm, commonly used by AWS, Google Cloud, and other major services.
"""

import asyncio
import time
from typing import Optional


class TokenBucketRateLimiter:
    """Token bucket rate limiter for controlling request rates.

    The token bucket algorithm allows controlled bursting while enforcing
    an average rate limit. Tokens are added at a constant rate, and each
    request consumes one token. If no tokens are available, the request
    waits until a token becomes available.

    Example:
        # 30 requests per minute
        limiter = TokenBucketRateLimiter(rate=0.5, capacity=30)

        async def make_request():
            await limiter.acquire()
            # ... make the actual request
    """

    def __init__(self, rate: float, capacity: int):
        """Initialize the rate limiter.

        Args:
            rate: Tokens added per second. For 30 requests/minute, use 0.5.
            capacity: Maximum tokens (burst size). Typically equals the rate limit.
        """
        self.rate = rate
        self.capacity = capacity
        self.tokens = float(capacity)
        self.last_refill = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self, timeout: Optional[float] = None) -> bool:
        """Wait until a token is available, then consume it.

        Args:
            timeout: Maximum seconds to wait. None means wait indefinitely.

        Returns:
            True if token was acquired, False if timeout expired.
        """
        start_time = time.monotonic()

        async with self._lock:
            self._refill()

            while self.tokens < 1:
                if timeout is not None:
                    elapsed = time.monotonic() - start_time
                    remaining = timeout - elapsed
                    if remaining <= 0:
                        return False

                # Calculate wait time for next token
                wait_time = (1 - self.tokens) / self.rate

                if timeout is not None:
                    wait_time = min(wait_time, remaining)

                await asyncio.sleep(wait_time)
                self._refill()

            self.tokens -= 1
            return True

    def _refill(self) -> None:
        """Refill tokens based on elapsed time since last refill."""
        now = time.monotonic()
        elapsed = now - self.last_refill
        self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
        self.last_refill = now

    @property
    def available_tokens(self) -> float:
        """Return the current number of available tokens (approximate)."""
        return self.tokens

    @classmethod
    def from_requests_per_minute(cls, requests_per_minute: int) -> "TokenBucketRateLimiter":
        """Create a rate limiter from a requests-per-minute limit.

        Args:
            requests_per_minute: Maximum requests allowed per minute.

        Returns:
            A configured TokenBucketRateLimiter instance.
        """
        rate = requests_per_minute / 60.0
        return cls(rate=rate, capacity=requests_per_minute)
