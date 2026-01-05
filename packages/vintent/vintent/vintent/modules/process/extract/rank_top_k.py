from typing import Any, Dict, List

PROCESS_ID = "rank_top_k"
PROCESS_PHASE = "extract"

REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "rowwise"


def schema(profile, context=None):
    quantitative_columns = [name for name, meta in profile["fields"].items() if meta.get("type") == "quantitative"]
    if not quantitative_columns:
        return None
    return {
        "id": PROCESS_ID,
        "phase": PROCESS_PHASE,
        "description": ("Select the top K rows by sorting on a quantitative column."),
        "params": {
            "type": "object",
            "properties": {
                "sort_by": {
                    "type": "string",
                    "enum": quantitative_columns,
                },
                "order": {
                    "type": "string",
                    "enum": ["asc", "desc"],
                },
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                },
            },
            "required": ["sort_by", "order", "limit"],
            "additionalProperties": False,
        },
    }


def run(rows: List[Dict[str, object]], params: Dict[str, Any]) -> List[Dict[str, object]]:
    out: List[Dict[str, object]] = []
    if rows:
        col = params.get("sort_by")
        order = params.get("order")
        limit = params.get("limit")
        reverse = order == "desc"
        sorted_rows = sorted(
            rows,
            key=lambda r: (r.get(col) is None, r.get(col)),
            reverse=reverse,
        )
        if isinstance(limit, int) and limit > 0:
            out = sorted_rows[:limit]
        else:
            out = sorted_rows
    return out


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "schema": schema,
    "run": run,
}
