"""Which Galaxy operations are destructive; the structured half of loom's classifier."""


def _update_history(args):
    if args.get("purged") is True:
        return ("history-purge", True)
    if args.get("deleted") is True:
        return ("history-delete", False)
    return None


DESTRUCTIVE_OPS = {"update_history": _update_history}


def _normalize(name):
    """Lowercase and drop a leading `galaxy_` so prefixed and bare names agree."""
    return str(name or "").strip().lower().removeprefix("galaxy_")


def classify(tool_name, args):
    """The destructive operation this call performs, or None."""
    predicate = DESTRUCTIVE_OPS.get(_normalize(tool_name))
    if predicate is None:
        return None
    hit = predicate(args if isinstance(args, dict) else {})
    if hit is None:
        return None
    kind, irreversible = hit
    op = {"kind": kind, "irreversible": irreversible}
    history_id = args.get("history_id")
    if isinstance(history_id, str):
        op["history_id"] = history_id
    return op


def describe(op):
    """An honest one-line headline, worded as loom words it."""
    if op["irreversible"]:
        target = f"history {op['history_id']}" if op.get("history_id") else "the entire history"
        return f"Permanently PURGE {target} — this deletes all of its datasets and cannot be undone."
    suffix = f" ({op['history_id']})" if op.get("history_id") else ""
    return (
        f"Mark the entire history{suffix} as deleted — not just specific datasets. "
        "Recoverable via Undelete on most Galaxy servers, but it affects the whole history."
    )
