"""What may be resent. A POST Galaxy already applied would run the job a second time."""

import asyncio

import pytest

from olit.exceptions import HttpError
from olit.substrate.http import HttpClient


class Recording(HttpClient):
    """A transport that fails with `status` for `failures` attempts, then succeeds."""

    def __init__(self, status, failures=99):
        self.status = status
        self.failures = failures
        self.attempts = []

    async def _attempt(self, method, url, headers, body, signal, binary):
        self.attempts.append((method, url))
        if len(self.attempts) <= self.failures:
            return None, (self.status, "boom", {})
        return {"ok": True}, None


def send(client, method, **kwargs):
    return asyncio.run(client.request(method, "http://galaxy/api/thing", **kwargs))


@pytest.fixture(autouse=True)
def _no_waiting(monkeypatch):
    """The backoff is honoured elsewhere; here it would only make the suite slow."""
    real = asyncio.sleep
    monkeypatch.setattr(asyncio, "sleep", lambda _seconds: real(0))


@pytest.mark.parametrize("method", ["GET", "PUT", "DELETE"])
def test_a_server_error_is_resent_for_an_idempotent_method(method):
    client = Recording(503, failures=1)
    assert send(client, method) == {"ok": True}
    assert len(client.attempts) == 2


def test_a_server_error_is_not_resent_for_a_post():
    client = Recording(503)
    with pytest.raises(HttpError) as raised:
        send(client, "POST")
    assert raised.value.status_code == 503
    assert len(client.attempts) == 1


def test_a_post_may_ask_for_server_errors_to_be_resent():
    # An LLM completion that errored produced nothing, so asking again repeats nothing.
    client = Recording(500, failures=1)
    assert send(client, "POST", retry_errors=True) == {"ok": True}
    assert len(client.attempts) == 2


def test_a_rate_limit_is_resent_whatever_the_method():
    client = Recording(429, failures=1)
    assert send(client, "POST") == {"ok": True}
    assert len(client.attempts) == 2


def test_a_client_error_is_never_resent():
    client = Recording(404)
    with pytest.raises(HttpError):
        send(client, "GET")
    assert len(client.attempts) == 1


def test_the_attempts_are_capped():
    client = Recording(503)
    with pytest.raises(HttpError):
        send(client, "GET")
    assert len(client.attempts) == 3


def test_the_method_reaches_the_transport_uppercased():
    client = Recording(200, failures=0)
    send(client, "get")
    assert client.attempts == [("GET", "http://galaxy/api/thing")]
