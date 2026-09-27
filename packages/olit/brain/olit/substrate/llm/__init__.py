"""LLM access: which endpoint, in which dialect, under which limits."""

from .api import REASONING_KEYS, Reply, get_adapter
from .client import Llm
from .providers import REGISTRY, Limits, Model, Provider, Target, resolve

__all__ = [
    "Llm",
    "REASONING_KEYS",
    "Reply",
    "get_adapter",
    "resolve",
    "REGISTRY",
    "Provider",
    "Model",
    "Limits",
    "Target",
]
