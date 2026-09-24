"""Schema-builder catalog: functions from resolved args to a JSON Schema."""

import logging
from collections.abc import Callable
from typing import Any

logger = logging.getLogger(__name__)

SchemaBuilderFn = Callable[..., dict[str, Any]]

_registry: dict[str, SchemaBuilderFn] = {}


def register_builder(name: str) -> Callable[[SchemaBuilderFn], SchemaBuilderFn]:
    """Decorator: register a schema-builder under a stable name."""

    def decorator(fn: SchemaBuilderFn) -> SchemaBuilderFn:
        if name in _registry:
            raise ValueError(f"Schema builder '{name}' already registered")
        _registry[name] = fn
        logger.debug("Registered schema builder: %s", name)
        return fn

    return decorator


def get_builder(name: str) -> SchemaBuilderFn:
    """Look up a registered schema-builder by name."""
    if name not in _registry:
        raise KeyError(f"Unknown schema builder: '{name}'")
    return _registry[name]


def is_build_spec(spec: Any) -> bool:
    """True if a schema spec is state-derived (`{$build: ..., args: ...}`)."""
    return isinstance(spec, dict) and "$build" in spec


def list_all() -> list[str]:
    """List registered schema-builder names (for auditability)."""
    return sorted(_registry.keys())
