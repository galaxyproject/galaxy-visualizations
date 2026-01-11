from typing import Any, Callable, Dict, List, Literal, Optional, TypedDict

from vintent.core.exceptions import ProcessError

from .analyze.cardinality_report import PROCESS as cardinality_report
from .analyze.compute_bins import PROCESS as compute_bins
from .analyze.correlation_matrix import PROCESS as correlation_matrix
from .analyze.covariance import PROCESS as covariance
from .analyze.density_estimate import PROCESS as density_estimate
from .analyze.drop_missing import PROCESS as drop_missing
from .analyze.ecdf import PROCESS as ecdf
from .analyze.group_aggregate import PROCESS as group_aggregate
from .analyze.group_summary_statistics import PROCESS as group_summary_statistics
from .analyze.linear_regression import PROCESS as linear_regression
from .analyze.pca import PROCESS as pca
from .analyze.quantiles import PROCESS as quantiles
from .analyze.standardize_columns import PROCESS as standardize_columns
from .analyze.summary_statistics import PROCESS as summary_statistics
from .extract.categorical_filter import PROCESS as categorical_filter
from .extract.project_columns import PROCESS as project_columns
from .extract.range_filter import PROCESS as range_filter
from .extract.rank_top_k import PROCESS as rank_top_k
from .extract.sort_rows import PROCESS as sort_rows


# Type aliases for clarity
DataShape = Literal["rowwise", "aggregate"]
ProcessPhase = Literal["extract", "analyze"]
RowType = Dict[str, Any]
RowsType = List[RowType]
ParamsType = Dict[str, Any]


class Process(TypedDict, total=False):
    """Definition of a data processing step.

    Required fields:
        id: Unique identifier for the process
        run: Function that transforms rows given parameters
        log: Function that returns a human-readable description of the operation

    Optional fields:
        schema: Function that returns parameter schema based on profile/context
        phase: Whether this is an 'extract' or 'analyze' process
        requires_shape: Expected input data shape ('rowwise' or 'aggregate')
        produces_shape: Output data shape after processing
    """

    id: str
    run: Callable[[RowsType, ParamsType], RowsType]
    log: Callable[[ParamsType], str]
    schema: Optional[Callable]
    phase: ProcessPhase
    requires_shape: DataShape
    produces_shape: DataShape


def validate_process(process_dict: Dict[str, Any]) -> Process:
    """Validate a process definition has required fields.

    Args:
        process_dict: The process definition dict to validate

    Returns:
        The validated process dict (cast to Process type)

    Raises:
        ValueError: If required fields are missing
    """
    required_keys = {"id", "run", "log"}
    missing = required_keys - set(process_dict.keys())
    if missing:
        process_id = process_dict.get("id", "unknown")
        raise ValueError(f"Process '{process_id}' missing required keys: {missing}")
    return process_dict  # type: ignore


def _build_registry(processes: List[Dict[str, Any]]) -> Dict[str, Process]:
    """Build a process registry from a list of process definitions.

    Validates each process and creates a dict keyed by process ID.
    """
    registry: Dict[str, Process] = {}
    for p in processes:
        validated = validate_process(p)
        registry[validated["id"]] = validated
    return registry


class PROCESSES:

    ANALYZE = _build_registry(
        [
            cardinality_report,
            compute_bins,
            correlation_matrix,
            covariance,
            density_estimate,
            ecdf,
            group_aggregate,
            group_summary_statistics,
            linear_regression,
            pca,
            quantiles,
            standardize_columns,
            summary_statistics,
        ]
    )

    EXTRACT = _build_registry(
        [
            range_filter,
            categorical_filter,
            drop_missing,
            sort_rows,
            rank_top_k,
            project_columns,
        ]
    )


def run_process(
    process: Process, rows: List[Dict[str, Any]], params: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """Execute a data processing step.

    Args:
        process: The process definition to execute
        rows: Input data rows
        params: Parameters for the process

    Returns:
        Transformed data rows

    Raises:
        ProcessError: If the process is missing or execution fails
    """
    if not process:
        raise ProcessError("Process is missing.", details={"params": params})

    process_id = process.get("id", "unknown")

    try:
        return process["run"](rows, params)
    except KeyError as e:
        raise ProcessError(
            f"Process '{process_id}' missing required key: {e}",
            details={"process_id": process_id, "key": str(e)},
        )
    except TypeError as e:
        raise ProcessError(
            f"Process '{process_id}' received invalid parameters: {e}",
            details={"process_id": process_id, "params": params},
        )
    except ProcessError:
        # Re-raise ProcessError as-is
        raise
    except Exception as e:
        raise ProcessError(
            f"Process '{process_id}' failed: {e}",
            details={"process_id": process_id, "original_error": str(e)},
        )
