from typing import Any, Dict, List

PROCESS_ID = "group_aggregate"

AGG_OPS = {"mean", "sum", "min", "max", "count"}


def run(rows: List[Dict[str, Any]], params: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not rows:
        return []

    group_by = params.get("group_by")
    op = params.get("op")
    metric = params.get("metric")

    if not group_by or not op or op not in AGG_OPS:
        return rows

    groups: Dict[Any, List[Dict[str, Any]]] = {}
    for row in rows:
        key = row.get(group_by)
        groups.setdefault(key, []).append(row)

    out: List[Dict[str, Any]] = []

    for key, group in groups.items():
        if op == "count":
            out.append(
                {
                    group_by: key,
                    "count": len(group),
                }
            )
            continue

        values = [r.get(metric) for r in group if isinstance(r.get(metric), (int, float))]

        if not values:
            continue

        if op == "mean":
            agg = sum(values) / len(values)
        elif op == "sum":
            agg = sum(values)
        elif op == "min":
            agg = min(values)
        elif op == "max":
            agg = max(values)
        else:
            continue

        out.append(
            {
                group_by: key,
                metric: float(agg),
            }
        )

    return out


def log(params: Dict[str, Any]) -> str:
    group_by = params.get("group_by")
    op = params.get("op")
    metric = params.get("metric")

    if op == "count":
        return f"Grouped by {group_by} and counted rows."
    return f"Grouped by {group_by} and computed {op} of {metric}."


PROCESS = {
    "id": PROCESS_ID,
    "run": run,
    "log": log,
}
