"""Materializer catalog with freeze semantics."""

import importlib.metadata
import logging
from collections.abc import Callable
from typing import Any

logger = logging.getLogger(__name__)

# Type alias for materializer functions
MaterializerFn = Callable[..., Any]


class MaterializerCatalog:
    """Registry of materializer functions with freeze semantics."""

    def __init__(self) -> None:
        self._registry: dict[str, MaterializerFn] = {}
        self._frozen: bool = False

    def register(self, name: str, fn: MaterializerFn) -> None:
        """Register a materializer function."""
        if self._frozen:
            raise RuntimeError(f"Cannot register '{name}': catalog is frozen")
        if name in self._registry:
            raise ValueError(f"Materializer '{name}' already registered")
        self._registry[name] = fn
        logger.debug("Registered materializer: %s", name)

    def get(self, name: str) -> MaterializerFn:
        """Get a materializer function by name."""
        if name not in self._registry:
            raise KeyError(f"Unknown materializer: '{name}'")
        return self._registry[name]

    def freeze(self) -> None:
        """Freeze the catalog, preventing further registrations."""
        self._frozen = True
        logger.info("Materializer catalog frozen with %s entries", len(self._registry))

    def is_frozen(self) -> bool:
        """Check if the catalog is frozen."""
        return self._frozen

    def list_all(self) -> list[str]:
        """List all registered materializer names (for auditability)."""
        return sorted(self._registry.keys())

    def clear(self) -> None:
        """Clear the catalog and reset frozen state. For testing only."""
        self._registry.clear()
        self._frozen = False


# Module-level singleton
_catalog = MaterializerCatalog()


def register(name: str) -> Callable[[MaterializerFn], MaterializerFn]:
    """Decorator for registering materializer functions."""

    def decorator(fn: MaterializerFn) -> MaterializerFn:
        _catalog.register(name, fn)
        return fn

    return decorator


def get(name: str) -> MaterializerFn:
    """Get a materializer function by name."""
    return _catalog.get(name)


def freeze() -> None:
    """Freeze the catalog, preventing further registrations."""
    _catalog.freeze()


def is_frozen() -> bool:
    """Check if the catalog is frozen."""
    return _catalog.is_frozen()


def list_all() -> list[str]:
    """List all registered materializer names."""
    return _catalog.list_all()


def load_entry_points() -> None:
    """Load all materializers from entry points, then freeze."""
    if _catalog.is_frozen():
        raise RuntimeError("Catalog already initialized")

    eps = importlib.metadata.entry_points(group="olit.materializers")
    for ep in eps:
        logger.debug("Loading materializer entry point: %s", ep.name)
        try:
            register_all = ep.load()
            register_all()
        except Exception as e:
            logger.error("Failed to load materializer entry point '%s': %s", ep.name, e)
            raise

    _catalog.freeze()
