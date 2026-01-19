"""Materializer catalog with freeze semantics.

The catalog is populated at framework initialization via entry points,
then frozen before any pipeline executes. Once frozen, no new registrations
are allowed, ensuring that a given YAML always resolves to the same callable set.
"""

import importlib.metadata
import logging
from typing import Any, Callable

logger = logging.getLogger(__name__)

# Type alias for materializer functions
MaterializerFn = Callable[..., Any]


class MaterializerCatalog:
    """Registry of materializer functions with freeze semantics.

    Entry points are loaded at startup, then the catalog is frozen.
    After freezing, no new registrations are allowed.
    """

    def __init__(self) -> None:
        self._registry: dict[str, MaterializerFn] = {}
        self._frozen: bool = False

    def register(self, name: str, fn: MaterializerFn) -> None:
        """Register a materializer function.

        Args:
            name: Stable identifier for the materializer
            fn: The callable to register

        Raises:
            RuntimeError: If the catalog is frozen
            ValueError: If a materializer with this name already exists
        """
        if self._frozen:
            raise RuntimeError(f"Cannot register '{name}': catalog is frozen")
        if name in self._registry:
            raise ValueError(f"Materializer '{name}' already registered")
        self._registry[name] = fn
        logger.debug(f"Registered materializer: {name}")

    def get(self, name: str) -> MaterializerFn:
        """Get a materializer function by name.

        Args:
            name: The materializer identifier

        Returns:
            The registered callable

        Raises:
            KeyError: If no materializer with this name exists
        """
        if name not in self._registry:
            raise KeyError(f"Unknown materializer: '{name}'")
        return self._registry[name]

    def freeze(self) -> None:
        """Freeze the catalog, preventing further registrations."""
        self._frozen = True
        logger.info(f"Materializer catalog frozen with {len(self._registry)} entries")

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
    """Decorator for registering materializer functions.

    Usage:
        @register("my_module.my_materializer")
        def my_materializer(workspace: str, data: dict) -> str:
            ...

    Args:
        name: Stable identifier for the materializer

    Returns:
        Decorator that registers the function
    """

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
    """Load all materializers from entry points, then freeze.

    This function discovers and loads materializer registration hooks from
    installed packages via the 'polaris.materializers' entry point group.
    After loading, the catalog is frozen to prevent runtime modifications.

    Raises:
        RuntimeError: If the catalog is already frozen
    """
    if _catalog.is_frozen():
        raise RuntimeError("Catalog already initialized")

    eps = importlib.metadata.entry_points(group="polaris.materializers")
    for ep in eps:
        logger.debug(f"Loading materializer entry point: {ep.name}")
        try:
            register_all = ep.load()
            register_all()
        except Exception as e:
            logger.error(f"Failed to load materializer entry point '{ep.name}': {e}")
            raise

    _catalog.freeze()


def _get_catalog() -> MaterializerCatalog:
    """Get the singleton catalog instance. For testing only."""
    return _catalog
