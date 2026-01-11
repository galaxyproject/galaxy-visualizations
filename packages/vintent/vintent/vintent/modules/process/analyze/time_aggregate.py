from __future__ import annotations

import math
from datetime import datetime
from typing import Any, Dict, List

PROCESS_ID = "time_aggregate"
PROCESS_PHASE = "analyze"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "aggregate"


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


def _get_period_key(dt: datetime, period: str) -> str:
    if period == "year":
        return str(dt.year)
    elif period == "month":
        return f"{dt.year}-{dt.month:02d}"
    elif period == "week":
        iso = dt.isocalendar()
        return f"{iso[0]}-W{iso[1]:02d}"
    elif period == "day":
        return dt.strftime("%Y-%m-%d")
    else:
        return dt.strftime("%Y-%m-%d")


def run(rows: List[Dict[str, Any]], params: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not rows:
        return []

    date_field = params.get("date_field")
    period = params.get("period", "month")
    metric = params.get("metric")
    op = params.get("op", "sum")

    if not date_field:
        return rows

    # Group by period
    groups: Dict[str, List[Dict[str, Any]]] = {}
    for row in rows:
        date_val = _parse_date(row.get(date_field))
        if date_val is None:
            continue
        key = _get_period_key(date_val, period)
        groups.setdefault(key, []).append(row)

    # Aggregate
    result: List[Dict[str, Any]] = []
    for key in sorted(groups.keys()):
        group = groups[key]

        if op == "count" or not metric:
            result.append({"period": key, "count": len(group)})
        else:
            values = [
                r.get(metric) for r in group
                if isinstance(r.get(metric), (int, float)) and math.isfinite(r.get(metric))
            ]
            if not values:
                continue

            if op == "sum":
                agg = sum(values)
            elif op == "mean":
                agg = sum(values) / len(values)
            elif op == "min":
                agg = min(values)
            elif op == "max":
                agg = max(values)
            else:
                agg = sum(values)

            result.append({"period": key, metric: agg})

    return result


def log(params: Dict[str, Any]) -> str:
    date_field = params.get("date_field", "date")
    period = params.get("period", "month")
    metric = params.get("metric")
    op = params.get("op", "sum")

    if op == "count" or not metric:
        return f"Aggregated by {period} from {date_field}, counted rows."
    return f"Aggregated by {period} from {date_field}, computed {op} of {metric}."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "log": log,
    "run": run,
}
