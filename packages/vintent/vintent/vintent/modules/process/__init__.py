from typing import Any, Callable, Dict, List, Optional, TypedDict

from .analyze.cardinality_report import PROCESS as cardinality_report
from .analyze.compute_bins import PROCESS as compute_bins
from .analyze.correlation_matrix import PROCESS as correlation_matrix
from .analyze.covariance import PROCESS as covariance
from .analyze.group_aggregate import PROCESS as group_aggregate
from .analyze.linear_regression import PROCESS as linear_regression
from .analyze.pca import PROCESS as pca
from .analyze.summary_statistics import PROCESS as summary_statistics
from .extract.categorical_filter import PROCESS as categorical_filter
from .extract.project_columns import PROCESS as project_columns
from .extract.range_filter import PROCESS as range_filter
from .extract.rank_top_k import PROCESS as rank_top_k
from .extract.sort_rows import PROCESS as sort_rows


class Process(TypedDict):
    id: str
    run: Callable[[List[Dict[str, Any]], Dict[str, Any]], List[Dict[str, Any]]]
    log: Callable
    schema: Optional[Callable]


class PROCESSES:

    ANALYZE = {
        p["id"]: p
        for p in [
            cardinality_report,
            compute_bins,
            correlation_matrix,
            covariance,
            linear_regression,
            group_aggregate,
            pca,
            summary_statistics,
        ]
    }

    EXTRACT = {
        p["id"]: p
        for p in [
            range_filter,
            categorical_filter,
            sort_rows,
            rank_top_k,
            project_columns,
        ]
    }


def run_process(process: Process, rows: List[Dict[str, Any]], params: Dict[str, Any]):
    if not process:
        raise Exception("Process is missing.")
    try:
        return process["run"](rows, params)
    except Exception as e:
        raise Exception(f"Process {process.get('id')} failed: {e}.")
