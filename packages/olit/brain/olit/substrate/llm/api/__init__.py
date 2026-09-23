"""Dialect adapters, keyed by the `api` a provider names."""

from .openai_completions import OpenAICompletions, Reply

ADAPTERS = {a.id: a for a in (OpenAICompletions(),)}


def get_adapter(api):
    adapter = ADAPTERS.get(api)
    if adapter is None:
        known = ", ".join(sorted(ADAPTERS))
        raise ValueError(f"No adapter for api {api!r}. Known: {known}.")
    return adapter


__all__ = ["ADAPTERS", "get_adapter", "OpenAICompletions", "Reply"]
