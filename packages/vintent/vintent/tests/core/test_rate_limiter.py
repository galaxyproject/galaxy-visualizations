"""Tests for the token bucket rate limiter."""

import asyncio
import time

import pytest

from vintent.core.rate_limiter import TokenBucketRateLimiter


class TestTokenBucketRateLimiter:
    @pytest.mark.asyncio
    async def test_allows_burst_up_to_capacity(self):
        """Should allow immediate requests up to capacity."""
        limiter = TokenBucketRateLimiter(rate=10, capacity=5)

        start = time.monotonic()
        for _ in range(5):
            result = await limiter.acquire()
            assert result is True
        elapsed = time.monotonic() - start

        # All 5 requests should complete almost instantly
        assert elapsed < 0.1

    @pytest.mark.asyncio
    async def test_throttles_after_burst(self):
        """Should throttle requests after burst capacity is exhausted."""
        # 10 tokens/second, capacity of 2
        limiter = TokenBucketRateLimiter(rate=10, capacity=2)

        start = time.monotonic()
        # First 2 are immediate (burst)
        await limiter.acquire()
        await limiter.acquire()
        # Third requires waiting for refill
        await limiter.acquire()
        elapsed = time.monotonic() - start

        # Should have waited ~0.1 seconds for 1 token to refill
        assert elapsed >= 0.09

    @pytest.mark.asyncio
    async def test_timeout_returns_false(self):
        """Should return False if timeout expires before token available."""
        limiter = TokenBucketRateLimiter(rate=1, capacity=1)

        # Exhaust the token
        await limiter.acquire()

        # Try to acquire with short timeout
        result = await limiter.acquire(timeout=0.05)
        assert result is False

    @pytest.mark.asyncio
    async def test_timeout_success_when_token_available(self):
        """Should return True if token becomes available before timeout."""
        limiter = TokenBucketRateLimiter(rate=100, capacity=1)

        await limiter.acquire()  # Exhaust

        # Token should refill in 0.01s, timeout is 0.1s
        result = await limiter.acquire(timeout=0.1)
        assert result is True

    @pytest.mark.asyncio
    async def test_from_requests_per_minute(self):
        """Should correctly create limiter from requests per minute."""
        limiter = TokenBucketRateLimiter.from_requests_per_minute(60)

        # 60 req/min = 1 req/sec
        assert limiter.rate == 1.0
        assert limiter.capacity == 60

    @pytest.mark.asyncio
    async def test_refill_over_time(self):
        """Should refill tokens over time."""
        # 10 tokens/second
        limiter = TokenBucketRateLimiter(rate=10, capacity=10)

        # Exhaust all tokens
        for _ in range(10):
            await limiter.acquire()

        # Wait for some refill
        await asyncio.sleep(0.2)

        # Should have ~2 tokens now (0.2s * 10 tokens/s)
        start = time.monotonic()
        await limiter.acquire()
        await limiter.acquire()
        elapsed = time.monotonic() - start

        # Should be nearly instant since we have refilled tokens
        assert elapsed < 0.05

    @pytest.mark.asyncio
    async def test_available_tokens_property(self):
        """Should report approximate available tokens."""
        limiter = TokenBucketRateLimiter(rate=10, capacity=5)

        assert limiter.available_tokens == 5

        await limiter.acquire()
        assert limiter.available_tokens == 4

    @pytest.mark.asyncio
    async def test_concurrent_access(self):
        """Should handle concurrent acquire calls safely."""
        limiter = TokenBucketRateLimiter(rate=100, capacity=10)

        async def acquire_token():
            return await limiter.acquire()

        # Launch 10 concurrent acquires
        results = await asyncio.gather(*[acquire_token() for _ in range(10)])

        assert all(results)
        assert limiter.available_tokens < 1
