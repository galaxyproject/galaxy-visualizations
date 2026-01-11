from typing import Any, Callable, Dict, List, Literal, Optional, TypedDict

from vintent.core.exceptions import ProcessError

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


def run_process(process: Process, rows: List[Dict[str, Any]], params: Dict[str, Any]) -> List[Dict[str, Any]]:
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
