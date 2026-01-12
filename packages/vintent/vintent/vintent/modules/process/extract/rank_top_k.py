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
        "description": (
            "Select top or bottom K rows. ONLY use when the user explicitly asks for "
            "'top N', 'bottom N', 'highest', 'lowest', 'largest', or 'smallest'. "
            "Do NOT use for simple visualizations."
        ),
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
                    "description": "Use 'asc' for lowest/smallest/bottom values, use 'desc' for highest/largest/top values.",
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


def log(params: Dict[str, Any]) -> str:
    col = params.get("sort_by", "unknown")
    order = params.get("order", "desc")
    limit = params.get("limit", 0)
    direction = "highest" if order == "desc" else "lowest"
    return f"Selected top {limit} rows by {direction} {col}."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "schema": schema,
    "log": log,
    "run": run,
}
