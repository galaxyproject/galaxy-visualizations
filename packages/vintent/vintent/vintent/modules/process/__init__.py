from typing import Any, Callable, Dict, List, Optional, TypedDict

from .extract.categorical_filter import PROCESS as categorical_filter
from .extract.project_columns import PROCESS as project_columns
from .extract.range_filter import PROCESS as range_filter
from .extract.rank_top_k import PROCESS as rank_top_k
from .extract.sort_rows import PROCESS as sort_rows
from .finalize.compute_bins import PROCESS as compute_bins
from .finalize.correlation_matrix import PROCESS as correlation_matrix
from .finalize.linear_regression import PROCESS as linear_regression


class Process(TypedDict):
    id: str
    run: Callable[[List[Dict[str, Any]], Dict[str, Any]], List[Dict[str, Any]]]
    log: Callable
    schema: Optional[Callable]


class PROCESSES:
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

    FINALIZE = {
        p["id"]: p
        for p in [
            compute_bins,
            correlation_matrix,
            linear_regression,
        ]
    }


def run_process(process: Process, rows: List[Dict[str, Any]], params: Dict[str, Any]):
    if not process:
        raise Exception("Process is missing.")
    try:
        return process["run"](rows, params)
    except Exception as e:
        raise Exception(f"Process {process.get('id')} failed: {e}.")
