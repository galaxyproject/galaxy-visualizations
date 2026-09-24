"""One-line summaries for logs, so the same value reads the same everywhere."""

import json

LIMIT = 300


def brief(value, limit=LIMIT):
    text = value if isinstance(value, str) else json.dumps(value, default=str)
    return text if len(text) <= limit else text[:limit] + "…"


# Enough either side of a break to see what the model was writing when it lost the thread.
WINDOW = 140


def around(text, position, window=WINDOW):
    """The text either side of an offset, marking it. A head-only excerpt hides a late break."""
    text = text or ""
    start, end = max(0, position - window), min(len(text), position + window)
    return (("…" if start else "") + text[start:position] + "⟨here⟩" + text[position:end]
            + ("…" if end < len(text) else ""))
