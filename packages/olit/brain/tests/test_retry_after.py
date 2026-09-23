"""A rate limiter states how long to wait, and the retry has to honour it."""

from olit.substrate.http import MAX_RETRY_AFTER, RETRY_INFO_TYPE, retry_after

GEMINI_429 = [
    {
        "error": {
            "code": 429,
            "message": "You exceeded your current quota",
            "details": [
                {"@type": "type.googleapis.com/google.rpc.Help", "links": []},
                {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "14s"},
            ],
        }
    }
]


def test_the_standard_header_wins():
    assert retry_after({"Retry-After": "30"}, None) == 30.0


def test_header_casing_does_not_matter():
    """Nobody guarantees casing, and fetch lowercases on the way through."""
    assert retry_after({"retry-after": "30"}, None) == 30.0
    assert retry_after({"RETRY-AFTER": "30"}, None) == 30.0


def test_the_http_date_form_is_understood():
    """RFC 9110 allows a date as well as delta-seconds; both are in the wild."""
    from datetime import datetime, timedelta, timezone

    soon = datetime.now(timezone.utc) + timedelta(seconds=20)
    stamp = soon.strftime("%a, %d %b %Y %H:%M:%S GMT")
    assert 15 <= retry_after({"Retry-After": stamp}, None) <= 25


def test_openais_millisecond_header_is_understood():
    """OpenAI sends `retry-after-ms`, sometimes without the seconds form."""
    assert retry_after({"retry-after-ms": "2500"}, None) == 2.5


def test_the_standard_header_beats_the_provider_specific_body():
    """Order is by how standard a source is, not by which provider we saw last."""
    body = [{"error": {"details": [{"@type": RETRY_INFO_TYPE, "retryDelay": "14s"}]}}]
    assert retry_after({"Retry-After": "3"}, body) == 3.0


def test_google_states_the_delay_in_the_body_not_a_header():
    """Measured against the live API: Gemini sends no Retry-After, only RetryInfo."""
    assert retry_after(None, GEMINI_429) == 14.0


def test_the_body_is_read_whether_parsed_or_raw():
    import json

    assert retry_after(None, json.dumps(GEMINI_429)) == 14.0


def test_an_absent_delay_is_none_so_the_caller_backs_off_itself():
    assert retry_after(None, None) is None
    assert retry_after({}, "not json") is None
    assert retry_after(None, [{"error": {"details": []}}]) is None


def test_a_wild_delay_cannot_hang_the_turn():
    assert retry_after({"Retry-After": "99999"}, None) == MAX_RETRY_AFTER


def test_a_malformed_header_falls_through_rather_than_raising():
    assert retry_after({"Retry-After": "soon"}, GEMINI_429) == 14.0
    assert retry_after({"Retry-After": "soon"}, None) is None


def test_the_delay_the_old_code_would_have_used_was_too_short():
    """A guessed backoff is shorter than what a rate limiter asks for."""
    from olit.substrate.http import INITIAL_BACKOFF, MAX_RETRIES

    guessed = sum(INITIAL_BACKOFF * (2**a) for a in range(MAX_RETRIES - 1))
    assert guessed < retry_after(None, GEMINI_429)
