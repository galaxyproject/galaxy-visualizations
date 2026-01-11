from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

PROCESS_ID = "extract_date_parts"
PROCESS_PHASE = "analyze"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "rowwise"


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


def run(rows: List[Dict[str, Any]], params: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not rows:
        return []

    field = params.get("field")
    parts = params.get("parts", ["year", "month", "day"])

    if not field:
        return rows

    result: List[Dict[str, Any]] = []
    for row in rows:
        new_row = dict(row)
        date_val = _parse_date(row.get(field))

        if date_val:
            if "year" in parts:
                new_row[f"{field}_year"] = date_val.year
            if "month" in parts:
                new_row[f"{field}_month"] = date_val.month
            if "day" in parts:
                new_row[f"{field}_day"] = date_val.day
            if "weekday" in parts:
                new_row[f"{field}_weekday"] = date_val.strftime("%A")
            if "week" in parts:
                new_row[f"{field}_week"] = date_val.isocalendar()[1]
            if "quarter" in parts:
                new_row[f"{field}_quarter"] = (date_val.month - 1) // 3 + 1
            if "hour" in parts:
                new_row[f"{field}_hour"] = date_val.hour
        else:
            for part in parts:
                new_row[f"{field}_{part}"] = None

        result.append(new_row)

    return result


def log(params: Dict[str, Any]) -> str:
    field = params.get("field", "date")
    parts = params.get("parts", ["year", "month", "day"])
    parts_str = ", ".join(parts)
    return f"Extracted {parts_str} from {field}."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "log": log,
    "run": run,
}
