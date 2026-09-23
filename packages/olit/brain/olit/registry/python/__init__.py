"""Python processes: deterministic procedures that need no model decisions."""

from .lineage_report import lineage_report
from .organize_datasets import organize_datasets

PROCESSES = [lineage_report, organize_datasets]

__all__ = ["PROCESSES", "lineage_report", "organize_datasets"]
