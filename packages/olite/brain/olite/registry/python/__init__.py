"""Python processes: deterministic procedures that need no model decisions."""

from .organize_datasets import organize_datasets

PROCESSES = [organize_datasets]

__all__ = ["PROCESSES", "organize_datasets"]
