"""Materializer catalog for pure Python function invocation.

The catalog is loaded from entry points at framework initialization and frozen
before any pipeline executes. This ensures determinism and auditability.
"""

from .catalog import (
    MaterializerCatalog,
    freeze,
    get,
    is_frozen,
    list_all,
    load_entry_points,
    register,
)

__all__ = [
    "MaterializerCatalog",
    "freeze",
    "get",
    "is_frozen",
    "list_all",
    "load_entry_points",
    "register",
]
