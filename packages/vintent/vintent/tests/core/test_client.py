"""Tests for the HTTP client module."""

import pytest

from vintent.core.client import (
    INITIAL_BACKOFF,
    MAX_RETRIES,
    RETRY_STATUS_CODES,
    parse_response,
)
from vintent.core.exceptions import HttpError


class TestRetryConfiguration:
    def test_retry_status_codes_includes_rate_limit(self):
        assert 429 in RETRY_STATUS_CODES

    def test_retry_status_codes_includes_server_errors(self):
        assert 500 in RETRY_STATUS_CODES
        assert 502 in RETRY_STATUS_CODES
        assert 503 in RETRY_STATUS_CODES
        assert 504 in RETRY_STATUS_CODES

    def test_retry_status_codes_excludes_client_errors(self):
        assert 400 not in RETRY_STATUS_CODES
        assert 401 not in RETRY_STATUS_CODES
        assert 403 not in RETRY_STATUS_CODES
        assert 404 not in RETRY_STATUS_CODES

    def test_max_retries_is_reasonable(self):
        assert MAX_RETRIES >= 1
        assert MAX_RETRIES <= 5

    def test_initial_backoff_is_positive(self):
        assert INITIAL_BACKOFF > 0


class TestHttpError:
    def test_http_error_has_status_code(self):
        error = HttpError("Not found", status_code=404)
        assert error.status_code == 404
        assert error.code == "HTTP_ERROR"

    def test_http_error_has_details(self):
        error = HttpError(
            "Server error",
            status_code=500,
            details={"url": "/api/test", "method": "POST"},
        )
        assert error.details["url"] == "/api/test"
        assert error.details["method"] == "POST"

    def test_http_error_to_dict(self):
        error = HttpError("Bad request", status_code=400)
        result = error.to_dict()
        assert result["code"] == "HTTP_ERROR"
        assert result["message"] == "Bad request"
        assert result["status_code"] == 400


class TestParseResponse:
    @pytest.mark.asyncio
    async def test_parses_json_response(self):
        class MockResponse:
            async def text(self):
                return '{"key": "value"}'

        result = await parse_response(MockResponse())
        assert result == {"key": "value"}

    @pytest.mark.asyncio
    async def test_returns_text_on_invalid_json(self):
        class MockResponse:
            async def text(self):
                return "not json"

        result = await parse_response(MockResponse())
        assert result == "not json"

    @pytest.mark.asyncio
    async def test_handles_empty_response(self):
        class MockResponse:
            async def text(self):
                return ""

        result = await parse_response(MockResponse())
        assert result == ""
