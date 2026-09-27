"""What a session holds survives a turn's context changing, and a replaced one is released.

The shell learns the working history and the record page from tool results while a turn runs
and puts them back in the config. Session identity used to be the whole config, so the first
`notebook_resume` on a new session rebuilt everything: the `run_python` namespace was wiped
against a tool description that promises state persists, the rate limiter came back with a
full bucket, and the transport the old session held was never closed.
"""

import asyncio

import pytest

from olit import runtime
from olit.config import parse

BASE = {"galaxy_root": None, "session_id": "s1"}


@pytest.fixture(autouse=True)
def _fresh_worker():
    """The session is the worker's, so a test must not inherit the previous one's."""
    runtime._session = None
    yield
    runtime._session = None


def _for(**overrides):
    return asyncio.run(runtime._session_for(parse({**BASE, **overrides})))


# --- how an in-process caller builds one --------------------------------------


def test_a_session_takes_the_dict_an_in_process_caller_passes():
    """`~/agents` evals/lib/harness.py does `await Session(config).init()` with a plain dict.

    F3 added `config.identity()` to `Session.__init__`, which a dict does not have, and every
    scenario in the suite errored at construction before reaching the model. `runtime.run()`
    parses first, so nothing inside olit exercised the dict form.
    """
    session = runtime.Session(dict(BASE))

    assert session.config.session_id == "s1"
    assert session.identity == parse(BASE).identity()


def test_the_dict_form_keeps_the_stable_identity():
    """The behaviour F3 introduced, reached the way the harness reaches it."""
    first = runtime.Session(dict(BASE))

    assert first.identity == runtime.Session({**BASE, "record_page_id": "p1"}).identity
    assert first.identity != runtime.Session({**BASE, "ai_model": "another-model"}).identity


def test_a_dict_the_config_rejects_still_fails_at_construction():
    """Normalizing must not become a way to smuggle an unknown key past the model."""
    with pytest.raises(Exception):
        runtime.Session({**BASE, "not_a_real_key": 1})


# --- what identity is --------------------------------------------------------


def test_a_record_page_the_shell_learned_is_not_a_new_session():
    first = _for()
    again = _for(record_page_id="p1")

    assert again is first


def test_a_history_the_agent_chose_is_not_a_new_session():
    first = _for()

    assert _for(history_id="h9") is first


@pytest.mark.parametrize(
    "change",
    [
        {"ai_model": "another-model"},
        {"ai_provider": "ollama"},
        {"galaxy_root": "http://elsewhere.invalid/"},
        {"capabilities": ["llm", "read"]},
        {"ai_context_window": 8000},
    ],
)
def test_a_different_endpoint_grant_or_target_is_a_new_session(change):
    """Identity is everything the session was built from, so a new field defaults to rebuilding."""
    first = _for()

    assert _for(**change) is not first


# --- what survives -----------------------------------------------------------


def test_the_python_namespace_survives_the_record_page_being_learned():
    """`run_python`'s description promises state persists across calls."""
    session = _for()
    asyncio.run(session.substrate.local.run("kept = 41"))

    later = _for(record_page_id="p1")

    assert asyncio.run(later.substrate.local.run("kept")) == "41"


def test_the_rate_limiter_survives_it_too():
    session = _for()
    limiter = session.substrate.llm._limiter
    asyncio.run(limiter.acquire())
    spent = limiter.tokens

    later = _for(record_page_id="p1")

    assert later.substrate.llm._limiter is limiter
    assert limiter.tokens <= spent + 1


def test_a_rebuilt_session_starts_the_namespace_empty():
    """The other half of the contract: a different model is a different session."""
    session = _for()
    asyncio.run(session.substrate.local.run("kept = 41"))

    rebuilt = _for(ai_model="another-model")

    assert rebuilt is not session
    assert "kept" not in rebuilt.substrate.local._ns


# --- what the turn reads -----------------------------------------------------


def test_the_record_page_the_shell_names_reaches_the_driver():
    session = _for()
    assert session.driver.record["page_id"] is None

    _for(record_page_id="p1")

    assert session.driver.record["page_id"] == "p1"


def test_a_page_a_tool_opened_is_kept_when_the_shell_names_none():
    """The shell learns the page from the tool result, so for one turn only the driver knows."""
    session = _for()
    session.driver.record["page_id"] = "opened-mid-turn"

    _for()

    assert session.driver.record["page_id"] == "opened-mid-turn"


# --- what is released --------------------------------------------------------


def test_a_replaced_session_is_closed():
    session = _for()
    closed = []
    session.substrate.ops.close = lambda: _note(closed)

    _for(ai_model="another-model")

    assert closed == ["closed"]


async def _note(closed):
    closed.append("closed")


def test_a_session_that_is_kept_is_not_closed():
    session = _for()
    closed = []
    session.substrate.ops.close = lambda: _note(closed)

    _for(record_page_id="p1")

    assert closed == []
