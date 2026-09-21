"""Token bucket rate limiter for API request throttling."""

import asyncio
import time


class TokenBucketRateLimiter:
    def __init__(self, rate: float, capacity: int):
        self.rate = rate
        self.capacity = capacity
        self.tokens = float(capacity)
        self.last_refill = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        """Wait until a token is available, then consume it."""
        async with self._lock:
            self._refill()
            while self.tokens < 1:
                await asyncio.sleep((1 - self.tokens) / self.rate)
                self._refill()
            self.tokens -= 1

    def _refill(self) -> None:
        now = time.monotonic()
        self.tokens = min(self.capacity, self.tokens + (now - self.last_refill) * self.rate)
        self.last_refill = now

    @classmethod
    def from_requests_per_minute(cls, requests_per_minute: int) -> "TokenBucketRateLimiter":
        return cls(rate=requests_per_minute / 60.0, capacity=requests_per_minute)
