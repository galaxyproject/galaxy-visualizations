"""Which endpoint a config resolves to, and what that endpoint's properties are."""

import pytest

from olit.substrate.llm import REGISTRY, Limits, Model, Provider, get_adapter, resolve
from olit.substrate.llm.providers import DEFAULT_CONTEXT_WINDOW

# --- resolution ----------------------------------------------------------------


def test_galaxy_is_the_default():
    """Production reaches the model through Galaxy's proxy, not a provider."""
    target = resolve({})
    assert target.provider.id == "galaxy"
    assert target.base_url is None


def test_a_named_provider_supplies_its_own_endpoint():
    target = resolve({"ai_provider": "google", "ai_model": "gemini-3.7-flash"})
    assert target.base_url.endswith("/v1beta/openai")
    assert target.context_window == 1_000_000


def test_a_base_url_alone_means_a_custom_provider():
    """pi's rule: the presence of a base URL marks a custom entry."""
    target = resolve({"ai_base_url": "http://example.invalid/v1"})
    assert target.provider.id == "custom"
    assert target.base_url == "http://example.invalid/v1"


def test_an_unknown_provider_is_refused_by_name():
    with pytest.raises(ValueError) as e:
        resolve({"ai_provider": "nope"})
    assert "nope" in str(e.value) and "google" in str(e.value)


def test_an_explicit_base_url_overrides_the_provider_default():
    target = resolve({"ai_provider": "google", "ai_base_url": "http://proxy.invalid/v1"})
    assert target.base_url == "http://proxy.invalid/v1"


# --- the numbers the endpoint supplies -------------------------------------------


def test_galaxys_token_cap_reaches_the_request():
    """The proxy caps max_tokens at 8192; asking for more just gets clamped."""
    target = resolve({"ai_max_tokens": 16384})
    assert target.max_tokens == 8192


def test_a_model_supplies_its_own_window_so_nothing_has_to_be_configured():
    assert resolve({"ai_provider": "google", "ai_model": "gemini-3.7-flash"}).context_window == 1_000_000


def test_a_server_whose_window_is_its_own_asks_rather_than_assumes():
    """llama.cpp ignores the model name, so the window belongs to the running server."""
    target = resolve({"ai_provider": "ollama", "ai_model": "whatever.gguf"})
    assert target.provider.probe_window is True
    assert target.context_window == DEFAULT_CONTEXT_WINDOW


def test_only_a_provider_that_opts_in_is_probed():
    assert REGISTRY["google"].probe_window is False
    assert REGISTRY["galaxy"].probe_window is False


def test_config_still_wins_over_everything():
    target = resolve({"ai_provider": "ollama", "ai_context_window": 8000})
    assert target.context_window == 8000


def test_an_unknown_everything_falls_back_to_the_defaults():
    target = resolve({"ai_base_url": "http://x.invalid", "ai_model": "mystery"})
    assert target.context_window == DEFAULT_CONTEXT_WINDOW


def test_an_endpoint_that_states_no_cap_leaves_the_output_length_to_the_model():
    """pi omits max_tokens unless one is configured; an imposed cap truncates a long answer."""
    assert resolve({"ai_base_url": "http://x.invalid", "ai_model": "mystery"}).max_tokens is None


def test_the_rate_limit_comes_from_the_endpoint():
    """Measured: Gemini's free tier is 5/minute, which is a property of the endpoint."""
    assert resolve({"ai_provider": "google"}).rate_limit == 5
    assert resolve({"ai_provider": "deepseek"}).rate_limit == 30
    assert resolve({"ai_provider": "google", "ai_rate_limit": 60}).rate_limit == 60


# --- the dialect seam ------------------------------------------------------------


def test_every_registered_provider_names_a_dialect_that_exists():
    for provider in REGISTRY.values():
        assert get_adapter(provider.api) is not None


def test_an_unknown_dialect_is_refused_by_name():
    with pytest.raises(ValueError) as e:
        get_adapter("anthropic-messages")
    assert "anthropic-messages" in str(e.value)


def test_the_key_goes_only_in_the_authorization_header_by_default():
    """Browsers preflight every header, and Gemini rejects x-api-key outright."""
    target = resolve({"ai_provider": "google", "ai_model": "gemini-3.7-flash", "ai_api_key": "k"})
    headers = get_adapter(target.api).headers(target)
    assert headers["Authorization"] == "Bearer k"
    assert "x-api-key" not in headers


def test_the_adapter_builds_and_parses_one_round_trip():
    target = resolve({"ai_provider": "google", "ai_model": "gemini-3.7-flash", "ai_api_key": "k"})
    adapter = get_adapter(target.api)

    body = adapter.build_request(target, [{"role": "user", "content": "hi"}], tools=None)
    assert body["model"] == "gemini-3.7-flash"
    assert "max_tokens" not in body
    assert adapter.url(target).endswith("/chat/completions")
    assert adapter.headers(target)["Authorization"] == "Bearer k"

    reply = adapter.parse_reply(
        {
            "choices": [{"finish_reason": "stop", "message": {"content": "hello", "tool_calls": []}}],
            "usage": {"total_tokens": 12},
        }
    )
    assert reply.content == "hello"
    assert reply.finish_reason == "stop"
    assert reply.usage["total_tokens"] == 12


def _target(provider, model=None):
    from olit.substrate.llm.providers import Target

    return Target(provider, model or Model("m"), "http://x.invalid", None, 1000, None, 30)


def test_no_sampling_field_is_sent_unless_one_is_configured():
    """Orbit sends none, so a comparison run measures the runtime rather than our defaults."""
    body = get_adapter("openai-completions").build_request(_target(Provider(id="p")), [], None)
    assert "temperature" not in body and "top_p" not in body


def test_a_provider_that_needs_a_sampling_setting_can_state_one():
    provider = Provider(id="q", compat={"temperature": 0.2, "sampling_params": {"top_p": 0.8}})
    body = get_adapter("openai-completions").build_request(_target(provider), [], None)
    assert body["temperature"] == 0.2 and body["top_p"] == 0.8


def test_a_model_setting_beats_a_provider_setting():
    provider = Provider(id="p", compat={"temperature": 0.2})
    model = Model("m", compat={"temperature": 0.9})
    assert _target(provider, model).compat("temperature") == 0.9


# --- endpoint limits the brain can act on ----------------------------------------


def test_an_oversized_tool_schema_is_caught_before_the_request():
    """Galaxy rejects the whole request, not the offending tool, so we check first."""
    target = resolve({})
    adapter = get_adapter(target.api)
    fat = {"function": {"name": "huge", "description": "x" * 20000}}

    assert adapter.oversized_tools(target, [fat])
    assert adapter.oversized_tools(target, [{"function": {"name": "ok"}}]) == []


def test_an_endpoint_without_a_stated_cap_accepts_anything():
    target = resolve({"ai_base_url": "http://x.invalid"})
    adapter = get_adapter(target.api)
    assert adapter.oversized_tools(target, [{"function": {"name": "huge", "description": "x" * 99999}}]) == []


def test_galaxys_limits_are_recorded():
    limits = REGISTRY["galaxy"].limits
    assert (limits.max_tokens, limits.max_tool_bytes, limits.max_tools) == (8192, 16384, 128)
    assert isinstance(limits, Limits)


# --- asking the endpoint for its window -------------------------------------------


def test_the_probe_reads_llama_cpps_reported_window():
    import asyncio

    from olit.substrate.llm import client

    async def fake(method, url, **kw):
        assert url.endswith("/props")
        return {"default_generation_settings": {"n_ctx": 65536}}

    original = client.http.request
    client.http.request = fake
    try:
        assert asyncio.run(client._probe_window("http://127.0.0.1:11434/v1")) == 65536
    finally:
        client.http.request = original


def test_a_server_without_props_leaves_the_default_alone():
    import asyncio

    from olit.substrate.llm import client

    async def missing(method, url, **kw):
        raise RuntimeError("404")

    original = client.http.request
    client.http.request = missing
    try:
        assert asyncio.run(client._probe_window("http://127.0.0.1:11434/v1")) is None
    finally:
        client.http.request = original


def test_a_configured_window_is_not_overridden_by_a_probe():
    import asyncio

    from olit.substrate.llm import Llm
    from olit.substrate.manifest import CapabilityManifest

    llm = Llm({"ai_provider": "ollama", "ai_context_window": 8000}, CapabilityManifest())
    asyncio.run(llm.init())
    assert llm.target.context_window == 8000


def test_openrouter_reaches_several_vendors_on_one_key():
    """The point of the entry: one credential, so a cross-model matrix is config."""
    for model, window in (
        ("anthropic/claude-sonnet-5", 1_000_000),
        ("openai/gpt-5.6-terra", 1_050_000),
        ("deepseek/deepseek-v4-flash-0731", 1_310_720),
    ):
        target = resolve({"ai_provider": "openrouter", "ai_model": model})
        assert target.base_url == "https://openrouter.ai/api/v1"
        assert target.model.id == model
        assert target.context_window == window


def test_openrouter_states_no_rate_limit_because_it_has_no_fixed_one():
    """Gemini's 5/minute was measured; OpenRouter's scales with credit, so none is invented."""
    from olit.substrate.llm.providers import DEFAULT_RATE_LIMIT, OPENROUTER

    assert OPENROUTER.rate_limit is None
    assert (
        resolve({"ai_provider": "openrouter", "ai_model": "anthropic/claude-sonnet-5"}).rate_limit == DEFAULT_RATE_LIMIT
    )


def test_an_unlisted_openrouter_model_still_resolves():
    """The catalog moves; an id the registry has not seen must not be a hard failure."""
    target = resolve({"ai_provider": "openrouter", "ai_model": "some/new-model"})
    assert target.model.id == "some/new-model"
    assert target.context_window == DEFAULT_CONTEXT_WINDOW


def test_an_unusable_provider_response_is_an_error_not_an_empty_turn():
    """pi turns a failed provider response into stopReason "error"; a silent empty turn
    would be graded as the agent choosing to stop, which is a different claim."""
    from olit.exceptions import ProviderError

    adapter = get_adapter("openai-completions")

    with pytest.raises(ProviderError):
        adapter.parse_reply({"choices": []})
    with pytest.raises(ProviderError):
        adapter.parse_reply({})


def test_a_deliberate_empty_reply_with_a_stop_reason_still_parses():
    """A model may legitimately stop with nothing to add; that is not a provider failure."""
    adapter = get_adapter("openai-completions")

    reply = adapter.parse_reply({"choices": [{"message": {"content": ""}, "finish_reason": "stop"}]})

    assert reply.finish_reason == "stop"
    assert reply.content == ""


class _Adapter:
    """Answers empty the first N times, then normally."""

    def __init__(self, empties):
        self.empties = empties
        self.sent = 0

    def url(self, target):
        return "http://x/v1/chat/completions"

    def headers(self, target):
        return {}

    def oversized_tools(self, target, tools):
        return []

    def build_request(self, *a, **k):
        return {}

    def parse_reply(self, payload):
        from olit.exceptions import ProviderError

        self.sent += 1
        if self.sent <= self.empties:
            raise ProviderError("The model provider returned an empty response.")
        return "reply"


def _llm_with(adapter, monkeypatch):
    import olit.substrate.llm.client as client_mod
    from olit.substrate.llm.client import Llm

    async def fake_request(**kwargs):
        return {}

    monkeypatch.setattr(client_mod.http, "request", fake_request)
    monkeypatch.setattr(client_mod.asyncio, "sleep", lambda s: _done())

    llm = Llm.__new__(Llm)
    llm.adapter = adapter
    llm.target = resolve({"ai_provider": "openrouter", "ai_model": "x/y"})
    llm.manifest = type("M", (), {"require": lambda self, c: None})()
    llm._limiter = type("L", (), {"acquire": lambda self: _done()})()
    return llm


async def _done():
    return None


def test_one_empty_reply_is_resent_rather_than_raised(monkeypatch):
    """A single dropped response should not end a turn; two in a row is a broken endpoint."""
    import asyncio

    from olit.substrate.llm.client import EMPTY_REPLY_ATTEMPTS

    adapter = _Adapter(empties=1)
    llm = _llm_with(adapter, monkeypatch)

    assert asyncio.run(llm.complete([{"role": "user", "content": "hi"}])) == "reply"
    assert adapter.sent == 2
    assert EMPTY_REPLY_ATTEMPTS == 2


def test_a_persistently_empty_endpoint_still_raises(monkeypatch):
    import asyncio

    from olit.exceptions import ProviderError

    adapter = _Adapter(empties=5)
    llm = _llm_with(adapter, monkeypatch)

    with pytest.raises(ProviderError):
        asyncio.run(llm.complete([{"role": "user", "content": "hi"}]))
    assert adapter.sent == 2


def test_jetstream2_resolves_to_the_open_webui_proxy():
    """Free for ACCESS accounts and processed at IU, so it suits runs on real Galaxy data."""
    target = resolve({"ai_provider": "jetstream2", "ai_model": "llama-4-scout"})

    assert target.base_url == "https://llm.jetstream-cloud.org/api"
    assert get_adapter(target.api).url(target).endswith("/api/chat/completions")
    assert target.context_window == 328_000


def test_anthropic_opts_into_browser_access_or_a_browser_cannot_reach_it():
    """api.anthropic.com sends no Access-Control-Allow-Origin until a request opts in.

    Verified against the live endpoint: without this header the browser blocks the
    response, so the provider would be listed in the picker and fail on first use.
    """
    target = resolve({"ai_provider": "anthropic", "ai_api_key": "k", "ai_model": "m"})
    headers = get_adapter(target.api).headers(target)
    assert headers["anthropic-dangerous-direct-browser-access"] == "true"


def test_a_provider_without_extra_headers_sends_none():
    target = resolve({"ai_provider": "openai", "ai_api_key": "k", "ai_model": "m"})
    assert set(get_adapter(target.api).headers(target)) == {"Content-Type", "Authorization"}
