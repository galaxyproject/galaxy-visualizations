from typing import Any, Dict, List
from datetime import datetime, timedelta

PROCESS_ID = "date_filter"
PROCESS_PHASE = "extract"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "rowwise"


def schema(profile, context=None):
    temporal_columns = [
        name for name, meta in profile.get("fields", {}).items()
        if meta.get("type") == "temporal"
    ]
    if not temporal_columns:
        return None
    return {
        "id": PROCESS_ID,
        "phase": PROCESS_PHASE,
        "description": (
            "Filter rows by date range. Use when the user wants to filter by time period, "
            "such as 'last 30 days', 'this year', 'between dates', or 'recent data'."
        ),
        "params": {
            "type": "object",
            "properties": {
                "field": {
                    "type": "string",
                    "enum": temporal_columns,
                    "description": "The date/time field to filter on",
                },
                "start": {
                    "type": "string",
                    "description": "Start date (ISO format, e.g., '2024-01-01')",
                },
                "end": {
                    "type": "string",
                    "description": "End date (ISO format, e.g., '2024-12-31')",
                },
                "last_n_days": {
                    "type": "integer",
                    "minimum": 1,
                    "description": "Filter to last N days (alternative to start/end)",
                },
            },
            "required": ["field"],
            "additionalProperties": False,
        },
    }


def _parse_date(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        for fmt in ["%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"]:
            try:
                return datetime.strptime(value[:len("2024-01-01T00:00:00")], fmt)
            except ValueError:
                continue
    return None


def run(rows: List[Dict[str, object]], params: Dict[str, Any]) -> List[Dict[str, object]]:
    if not rows:
        return []

    field = params.get("field")
    start_str = params.get("start")
    end_str = params.get("end")
    last_n_days = params.get("last_n_days")

    if not field:
        return rows

    start_date = None
    end_date = None

    if last_n_days:
        end_date = datetime.now()
        start_date = end_date - timedelta(days=last_n_days)
    else:
        if start_str:
            start_date = _parse_date(start_str)
        if end_str:
            end_date = _parse_date(end_str)

    result: List[Dict[str, object]] = []
    for row in rows:
        value = row.get(field)
        date_val = _parse_date(value)
        if date_val is None:
            continue
        if start_date and date_val < start_date:
            continue
        if end_date and date_val > end_date:
            continue
        result.append(row)

    return result


def log(params: Dict[str, Any]) -> str:
    field = params.get("field", "date")
    start = params.get("start")
    end = params.get("end")
    last_n_days = params.get("last_n_days")

    if last_n_days:
        return f"Filtered {field} to last {last_n_days} days."
    if start and end:
        return f"Filtered {field} between {start} and {end}."
    if start:
        return f"Filtered {field} from {start} onwards."
    if end:
        return f"Filtered {field} up to {end}."
    return f"Applied date filter on {field}."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "schema": schema,
    "log": log,
    "run": run,
}
