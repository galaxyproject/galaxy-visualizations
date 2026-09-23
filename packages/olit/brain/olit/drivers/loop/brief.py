"""One-line summaries for logs, so the same value reads the same everywhere."""

import json

LIMIT = 300


def brief(value, limit=LIMIT):
    text = value if isinstance(value, str) else json.dumps(value, default=str)
    return text if len(text) <= limit else text[:limit] + "…"
