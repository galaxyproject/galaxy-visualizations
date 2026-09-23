"""Which endpoint olit talks to, and what that endpoint's properties are."""

import os
from dataclasses import dataclass, field

# Requested per reply when nothing narrower applies.
DEFAULT_MAX_TOKENS = 16384
# Assumed when neither the model nor the provider states one.
DEFAULT_CONTEXT_WINDOW = 128000
DEFAULT_RATE_LIMIT = 30


@dataclass(frozen=True)
class Limits:
    """What an endpoint refuses, as opposed to what a model cannot do."""

    max_tokens: int | None = None
    max_tool_bytes: int | None = None
    max_tools: int | None = None


@dataclass(frozen=True)
class Model:
    id: str | None = None
    context_window: int | None = None
    max_tokens: int | None = None
    compat: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Provider:
    id: str
    name: str | None = None
    api: str = "openai-completions"
    base_url: str | None = None
    auth_env: str | None = None
    limits: Limits = field(default_factory=Limits)
    models: dict = field(default_factory=dict)
    context_window: int | None = None
    rate_limit: int | None = None
    compat: dict = field(default_factory=dict)
    # llama.cpp reports its own n_ctx; ask rather than assume.
    probe_window: bool = False
    # The model is typed rather than picked, because this endpoint's catalog is the user's.
    free_model: bool = False

    def __post_init__(self):
        if self.name is None:
            object.__setattr__(self, "name", self.id)

    def model(self, model_id):
        """The named model, or a bare record so an unknown id still resolves."""
        return self.models.get(model_id) or Model(model_id)


# Galaxy's own caps, from lib/galaxy/webapps/galaxy/api/plugins.py.
GALAXY = Provider(
    id="galaxy",
    name="Galaxy chat proxy",
    limits=Limits(max_tokens=8192, max_tool_bytes=16384, max_tools=128),
)

GOOGLE = Provider(
    id="google",
    name="Google Gemini",
    base_url="https://generativelanguage.googleapis.com/v1beta/openai",
    auth_env="GEMINI_KEY",
    # Free tier is 5 requests/minute; measured, not read off a docs page.
    rate_limit=5,
    models={
        "gemini-3.7-flash": Model("gemini-3.7-flash", context_window=1_000_000),
        "gemini-3.1-flash-lite": Model("gemini-3.1-flash-lite", context_window=1_000_000),
    },
)

DEEPSEEK = Provider(
    id="deepseek",
    name="DeepSeek",
    base_url="https://api.deepseek.com/v1",
    auth_env="DEEPSEEK_KEY",
    models={"deepseek-v4-flash": Model("deepseek-v4-flash", context_window=1_000_000)},
)

OPENROUTER = Provider(
    id="openrouter",
    name="OpenRouter",
    base_url="https://openrouter.ai/api/v1",
    auth_env="OPENROUTER_KEY",
    # Limits scale with the credit balance, so no rate_limit is stated here.
    models={
        "anthropic/claude-sonnet-5": Model("anthropic/claude-sonnet-5", context_window=1_000_000),
        "openai/gpt-5.6-terra": Model("openai/gpt-5.6-terra", context_window=1_050_000),
        "deepseek/deepseek-v4-flash-0731": Model("deepseek/deepseek-v4-flash-0731", context_window=1_310_720),
        "google/gemini-3.7-flash": Model("google/gemini-3.7-flash", context_window=1_048_576),
        "google/gemini-3.1-flash-lite": Model("google/gemini-3.1-flash-lite", context_window=1_048_576),
    },
)

# Free for ACCESS accounts, hosted at IU; the Open WebUI proxy is the OpenAI-compatible path.
JETSTREAM2 = Provider(
    id="jetstream2",
    name="Jetstream2 LLM inference service",
    base_url="https://llm.jetstream-cloud.org/api",
    auth_env="JETSTREAM2_KEY",
    models={
        "llama-4-scout": Model("llama-4-scout", context_window=328_000),
        "gpt-oss-120b": Model("gpt-oss-120b", context_window=131_072),
    },
)

# llama.cpp and Ollama ignore the model name, so the window belongs to the server.
OLLAMA = Provider(
    id="ollama",
    name="Ollama or a local server",
    base_url="http://127.0.0.1:11434/v1",
    probe_window=True,
    free_model=True,
)

# The rest of what Orbit offers. Each speaks the OpenAI wire format at the URL below, and
# each publishes its own model catalog, so the model is typed rather than bundled here.
OPENAI = Provider(
    id="openai",
    name="OpenAI",
    base_url="https://api.openai.com/v1",
    auth_env="OPENAI_KEY",
    free_model=True,
)

ANTHROPIC = Provider(
    id="anthropic",
    name="Anthropic",
    # Anthropic's OpenAI-compatible surface; the native Messages wire format is not built yet.
    base_url="https://api.anthropic.com/v1",
    auth_env="ANTHROPIC_KEY",
    free_model=True,
    # Anthropic sends no CORS headers until a request opts in, so a browser cannot reach it.
    compat={"headers": {"anthropic-dangerous-direct-browser-access": "true"}},
)

GROQ = Provider(
    id="groq",
    name="Groq",
    base_url="https://api.groq.com/openai/v1",
    auth_env="GROQ_KEY",
    free_model=True,
)

MISTRAL = Provider(
    id="mistral",
    name="Mistral",
    base_url="https://api.mistral.ai/v1",
    auth_env="MISTRAL_KEY",
    free_model=True,
)

XAI = Provider(
    id="xai",
    name="xAI",
    base_url="https://api.x.ai/v1",
    auth_env="XAI_KEY",
    free_model=True,
)

REGISTRY = {p.id: p for p in (GALAXY, GOOGLE, DEEPSEEK, OPENROUTER, JETSTREAM2, OLLAMA,
                              OPENAI, ANTHROPIC, GROQ, MISTRAL, XAI)}


@dataclass(frozen=True)
class Target:
    """One resolved endpoint: everything a request needs, already reconciled."""

    provider: Provider
    model: Model
    base_url: str | None
    api_key: str | None
    context_window: int
    max_tokens: int
    rate_limit: int

    @property
    def api(self):
        return self.provider.api

    @property
    def limits(self):
        return self.provider.limits

    def compat(self, key, default=None):
        """Model settings win over provider settings."""
        if key in self.model.compat:
            return self.model.compat[key]
        return self.provider.compat.get(key, default)


def _first(*values):
    for value in values:
        if value:
            return value
    return None


def resolve(config):
    """The endpoint this config points at: named provider, else custom, else Galaxy."""
    config = config or {}
    named = config.get("ai_provider")
    base_url = config.get("ai_base_url")

    if named:
        provider = REGISTRY.get(named)
        if provider is None:
            known = ", ".join(sorted(REGISTRY))
            raise ValueError(f"Unknown ai_provider {named!r}. Known: {known}.")
    elif base_url:
        provider = Provider(id="custom", name="Custom endpoint", base_url=base_url)
    else:
        provider = GALAXY

    model = provider.model(config.get("ai_model"))
    max_tokens = min(
        _first(config.get("ai_max_tokens"), model.max_tokens, DEFAULT_MAX_TOKENS),
        provider.limits.max_tokens or DEFAULT_MAX_TOKENS,
    )
    return Target(
        provider=provider,
        model=model,
        base_url=_first(base_url, provider.base_url),
        api_key=_first(config.get("ai_api_key"), _from_env(provider.auth_env)),
        context_window=_first(
            config.get("ai_context_window"),
            model.context_window,
            provider.context_window,
            DEFAULT_CONTEXT_WINDOW,
        ),
        max_tokens=max_tokens,
        rate_limit=_first(config.get("ai_rate_limit"), provider.rate_limit, DEFAULT_RATE_LIMIT),
    )


def _from_env(name):
    return os.environ.get(name) if name else None
