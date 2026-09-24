"""A tutorial page must fit the result budget, and a 404 must not arrive as an HTML dump."""

import asyncio

import pytest

from olit.drivers.loop import gtn

from .fakes import refused


def fetch(monkeypatch, body):
    async def fake(method, url, **kwargs):
        if isinstance(body, Exception):
            raise body
        return body

    monkeypatch.setattr(gtn.http, "request", fake)
    return asyncio.run(gtn._gtn_fetch({"url": f"https://{gtn.GTN_HOST}/t/tutorial.html"}))


def test_a_short_page_is_returned_whole(monkeypatch):
    out = fetch(monkeypatch, "<p>Objectives: learn things</p>")
    assert "Objectives" in out["content"]
    assert "truncated" not in out


def test_an_oversized_page_is_truncated_and_says_so(monkeypatch):
    out = fetch(monkeypatch, "<p>" + ("word " * 40000) + "</p>")
    assert out["truncated"] is True
    assert len(out["content"]) == gtn.FETCH_MAX_CHARS
    assert out["chars_total"] > gtn.FETCH_MAX_CHARS
    assert str(gtn.FETCH_MAX_CHARS) in out["note"]


def test_the_result_stays_under_the_dispatcher_budget(monkeypatch):
    """The 64 KB cap discarded whole tutorials; that is what this bound exists to prevent."""
    import json

    out = fetch(monkeypatch, "<p>" + ("word " * 60000) + "</p>")
    assert len(json.dumps(out).encode("utf-8")) < 64 * 1024


def test_an_error_body_is_trimmed_and_carries_a_hint(monkeypatch):
    out = refused(fetch(monkeypatch, RuntimeError("HTTP 404: " + "<html>" * 5000)))
    assert len(out["error"]) <= gtn.ERROR_MAX_CHARS + 4
    assert "404" in out["error"]
    assert "gtn_search" in out["hint"]


def test_a_non_gtn_host_is_still_refused(monkeypatch):
    out = refused(asyncio.run(gtn._gtn_fetch({"url": "https://raw.githubusercontent.com/x/y"})))
    assert "Only URLs on" in out["error"]
