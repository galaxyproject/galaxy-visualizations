from typing import Any, Dict, List
import random

PROCESS_ID = "sample_rows"
PROCESS_PHASE = "extract"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "rowwise"


def schema(profile, context=None):
    row_count = profile.get("row_count", 0)
    if row_count < 2:
        return None
    return {
        "id": PROCESS_ID,
        "phase": PROCESS_PHASE,
        "description": (
            "Take a random sample of rows. Use when the user wants to see a sample, "
            "preview, or subset of the data for exploration."
        ),
        "params": {
            "type": "object",
            "properties": {
                "n": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": row_count,
                    "description": "Number of rows to sample",
                },
                "seed": {
                    "type": "integer",
                    "description": "Random seed for reproducibility (optional)",
                },
            },
            "required": ["n"],
            "additionalProperties": False,
        },
    }


def run(rows: List[Dict[str, object]], params: Dict[str, Any]) -> List[Dict[str, object]]:
    if not rows:
        return []
    n = params.get("n", 10)
    seed = params.get("seed")
    if seed is not None:
        random.seed(seed)
    n = min(n, len(rows))
    return random.sample(rows, n)


def log(params: Dict[str, Any]) -> str:
    n = params.get("n", 0)
    return f"Sampled {n} random rows."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "schema": schema,
    "log": log,
    "run": run,
}
