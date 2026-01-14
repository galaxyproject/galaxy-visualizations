import json
from typing import Any, Dict, List

PROCESS_ID = "deduplicate"
PROCESS_PHASE = "extract"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "rowwise"


def schema(profile, context=None):
    columns = list(profile.get("fields", {}).keys())
    if not columns:
        return None
    return {
        "id": PROCESS_ID,
        "phase": PROCESS_PHASE,
        "description": (
            "Remove duplicate rows. ONLY use when the user explicitly asks to "
            "'deduplicate', 'remove duplicates', or 'unique rows'. Do NOT use for simple visualizations."
        ),
        "params": {
            "type": "object",
            "properties": {
                "subset": {
                    "type": "array",
                    "items": {"type": "string", "enum": columns},
                    "description": "Columns to consider for duplicates (optional, defaults to all)",
                },
                "keep": {
                    "type": "string",
                    "enum": ["first", "last"],
                    "description": "Which duplicate to keep",
                },
            },
            "required": [],
            "additionalProperties": False,
        },
    }


def run(rows: List[Dict[str, object]], params: Dict[str, Any]) -> List[Dict[str, object]]:
    if not rows:
        return []
    subset = params.get("subset")
    keep = params.get("keep", "first")

    seen: Dict[str, int] = {}
    result: List[Dict[str, object]] = []

    for i, row in enumerate(rows):
        if subset:
            key_dict = {k: row.get(k) for k in subset}
        else:
            key_dict = row
        key = json.dumps(key_dict, sort_keys=True, default=str)

        if key not in seen:
            seen[key] = i
            if keep == "first":
                result.append(row)
        elif keep == "last":
            pass  # Will be handled in second pass

    if keep == "last":
        # Rebuild with last occurrences
        last_indices = set(seen.values())
        for i, row in enumerate(rows):
            if subset:
                key_dict = {k: row.get(k) for k in subset}
            else:
                key_dict = row
            key = json.dumps(key_dict, sort_keys=True, default=str)
            seen[key] = i
        last_indices = set(seen.values())
        result = [row for i, row in enumerate(rows) if i in last_indices]

    return result


def log(params: Dict[str, Any]) -> str:
    subset = params.get("subset")
    keep = params.get("keep", "first")
    if subset:
        cols = ", ".join(subset)
        return f"Removed duplicates based on [{cols}], keeping {keep}."
    return f"Removed duplicate rows, keeping {keep}."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "schema": schema,
    "log": log,
    "run": run,
}
