"""One shape for a bounded page of rows.

pi caps tool output on lines or bytes, whichever is hit first, and its notice names the
offset to continue from. Galaxy's list endpoints need the same two limits: a row count
alone does not bound cost when the rows are fat.
"""

import json

ROW_CAP = 100
ROW_BYTES_CAP = 32 * 1024


def page(rows, offset=0, limit=None):
    """A bounded window into `rows`, plus what the caller needs to ask for the rest."""
    limit = int(limit or ROW_CAP)
    offset = max(0, int(offset or 0))
    window, size = [], 0
    for row in rows[offset:offset + limit]:
        size += len(json.dumps(row, default=str))
        if window and size > ROW_BYTES_CAP:
            break
        window.append(row)
    out = {"items": window, "shown": len(window), "total": len(rows)}
    if offset + len(window) < len(rows):
        out["truncated"] = True
        out["next_offset"] = offset + len(window)
    return out
