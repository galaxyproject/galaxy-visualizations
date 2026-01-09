from __future__ import annotations
from typing import Any, Dict, List
from vintent.modules.utility import user_asked_for

PROCESS_ID = "group_aggregate"
PROCESS_PHASE = "analyze"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "rowwise"

AGG_OPS = {"mean", "sum", "min", "max", "count"}

def schema(profile, context=None):
    if not user_asked_for(context, ["group", "aggregate", "average", "mean", "sum", "count"]):
        return None
    fields = profile.get("fields", {})
    groupable = [k for k, v in fields.items() if v.get("type") == "nominal"]
    quantitative = [k for k, v in fields.items() if v.get("type") == "quantitative"]
    if not groupable:
        return None
    properties: Dict[str, Any] = {
        "group_by": {"type": "string", "enum": groupable},
        "op": {"type": "string", "enum": sorted(AGG_OPS)},
    }
    required = ["group_by", "op"]
    if quantitative:
        properties["metric"] = {"type": "string", "enum": quantitative}
    return {
        "id": PROCESS_ID,
        "phase": PROCESS_PHASE,
        "description": "Group rows by a categorical field and compute an aggregate statistic.",
        "params": {
            "type": "object",
            "properties": properties,
            "required": required,
            "additionalProperties": False,
        },
    }

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
            out.append({group_by: key, "count": len(group)})
        else:
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
            out.append({group_by: key, metric: float(agg)})
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
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "schema": schema,
    "log": log,
    "run": run,
}
