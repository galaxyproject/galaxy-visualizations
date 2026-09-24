"""Catch wasteful SRA fan-out before Galaxy receives any submissions.

A reply carries every sibling call before any of them is dispatched. Group only known
SRA download wrappers with identical destination and settings, and answer a blocked call
with an actionable tool error rather than a confirmation. The system prompt carries the
rest: opaque Python and accessions introduced one at a time cannot be inferred from
sibling calls.

Ported from loom's `extensions/loom/sra-import-gate.ts`. Two deliberate differences: there
is no MCP proxy to unwrap, and a gate lives on the ToolSurface, which is built per turn,
so loom's clear on session_start/agent_end/input needs no counterpart.
"""

import json
import re

_RUN_TOOL = re.compile(r"^(?:galaxy_)?run_tool$")
_SRA_TOOL = re.compile(r"^(?:(?:[^/]+/repos/iuc/sra_tools/)?(?:fastq_dump|fasterq_dump))(?:/[^/]+)?$")
_ACCESSION = re.compile(r"^(?:SRR|ERR|DRR)\d+$")
_SEPARATORS = re.compile(r"[\s,;]+")


def _obj(value):
    return value if isinstance(value, dict) else None


def _parse_obj(value):
    if not isinstance(value, str):
        return _obj(value)
    try:
        return _obj(json.loads(value))
    except (ValueError, TypeError):
        return None


def _stable(value):
    """A canonical rendering, so two spellings of the same settings share a key."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def _flatten(inputs):
    """Nested `input`/`adv` groups spelled the way a flat `input|accession` call spells them."""
    flat = {}
    for key, value in inputs.items():
        group = _obj(value) if key in ("input", "adv") else None
        if group is None:
            flat[key] = value
            continue
        for child, child_value in group.items():
            if child != "__current_case__":
                flat[f"{key}|{child}"] = child_value
    return flat


def _accessions(value):
    """The runs this value names, or None if it is not a plain list of accessions."""
    if not isinstance(value, str):
        return None
    runs = [run for run in _SEPARATORS.split(value.strip()) if run]
    return runs if runs and all(_ACCESSION.match(run) for run in runs) else None


class SraCall:
    """One recognised SRA import: where it lands, what it asks for, and how."""

    __slots__ = ("key", "history_id", "tool_id", "runs", "mapped", "file_list")

    def __init__(self, key, history_id, tool_id, runs, mapped, file_list):
        self.key = key
        self.history_id = history_id
        self.tool_id = tool_id
        self.runs = runs
        self.mapped = mapped
        self.file_list = file_list


def sra_call(name, args):
    """The SRA import this call performs, or None. Exact structured surfaces only."""
    if not _RUN_TOOL.match(str(name or "").strip().lower()):
        return None
    args = _parse_obj(args)
    if not args:
        return None
    tool_id, history_id = args.get("tool_id"), args.get("history_id")
    if not isinstance(tool_id, str) or not isinstance(history_id, str) or not history_id:
        return None
    if not _SRA_TOOL.match(tool_id):
        return None
    inputs = _parse_obj(args.get("inputs"))
    if inputs is None:
        return None
    flat = _flatten(inputs)
    mode = flat.get("input|input_select", "accession_number")
    if mode not in ("accession_number", "file_list"):
        return None
    value = flat.get("input|file_list" if mode == "file_list" else "input|accession")
    ref = _obj(value) or {}
    mapped = ref.get("__class__") == "Batch" or ref.get("batch") is True or ref.get("src") == "hdca"
    file_list = mode == "file_list" and ref.get("src") == "hda" and isinstance(ref.get("id"), str)
    settings = {k: v for k, v in flat.items() if k not in ("input|input_select", "input|accession", "input|file_list")}
    return SraCall(
        key=_stable({**args, "inputs": settings}),
        history_id=history_id,
        tool_id=tool_id,
        runs=_accessions(value) if mode == "accession_number" else None,
        mapped=mapped,
        file_list=file_list,
    )


def remediation(runs):
    """What to send instead, in the caller's own terms; no job was submitted."""
    unique = list(dict.fromkeys(runs))
    candidates = f"Candidate accessions from the blocked calls: {json.dumps(','.join(unique))}. " if unique else ""
    return (
        "Refused: batch SRA imports before submission. No job was submitted by this blocked call. "
        "Use one fastq_dump/fasterq_dump call for all requested, missing accessions with identical "
        "settings, not one job per accession or a mapped collection. "
        + candidates
        + "Exclude verified or running imports first. For the remaining accessions, use a "
        "comma-separated input|accession string with input|input_select=accession_number, or one "
        "text HDA (one accession per line) with input|input_select=file_list and "
        'input|file_list={src:"hda",id:<real dataset ID>}. '
        "Inspect the installed tool template; retain the extraction settings and use its "
        "list:paired output for paired reads. Check the history and notebook first so verified or "
        "running imports are not repeated. Correct the call yourself; do not ask the user to "
        "authorize batching or retry the same single-accession calls."
    )


class SraImportGate:
    """Turn-local import intent: what was fanned out, what was let through, what landed."""

    def __init__(self):
        # Rejected batches by settings key, kept across tool-error recovery so serializing
        # the same calls cannot pass. Each is a dict used as an ordered set, so the
        # remediation lists the accessions in the order the model asked for them.
        self._batches = {}
        self._blocked_calls = set()
        # A preflight can leave exactly one missing accession, and a literal singleton is
        # the right call for it. One singleton per key escapes; a second is serialization.
        self._released_singleton = set()
        # Accessions already sent in one combined call. Splitting them afterwards is
        # failure recovery, not fan-out.
        self._submitted = {}

    def observe(self, tool_calls):
        """Record the fan-out in one reply, before any of its calls is dispatched."""
        groups = {}
        for call in tool_calls or []:
            function = call.get("function") or {}
            parsed = sra_call(function.get("name"), function.get("arguments"))
            if parsed is None or parsed.mapped or not parsed.runs or len(parsed.runs) != 1:
                continue
            if parsed.runs[0] in self._submitted.get(parsed.key, ()):
                continue
            groups.setdefault(parsed.key, []).append((call.get("id"), parsed.runs[0]))
        for key, calls in groups.items():
            if len(calls) < 2:
                continue
            batch = self._batches.setdefault(key, {})
            for call_id, run in calls:
                batch[run] = None
                self._blocked_calls.add(call_id)

    def check(self, call_id, name, args):
        """Why this import must not run, or None."""
        call = sra_call(name, args)
        if call is None:
            return None
        batch = self._batches.get(call.key)
        duplicate = bool(call.runs) and len(set(call.runs)) < len(call.runs)
        single = call.runs[0] if call.runs and len(call.runs) == 1 else None
        serialized = bool(batch and single and len(batch) > 1 and single in batch)
        blocked = call_id in self._blocked_calls or call.mapped or duplicate
        if serialized and not blocked and call.key not in self._released_singleton:
            self._released_singleton.add(call.key)
            serialized = False
        if not blocked and not serialized:
            # A preflight may reduce the candidate set; do not force the original
            # candidates back into a corrected batch and re-download them.
            if batch is not None and single:
                batch.pop(single, None)
            if batch is not None and (call.file_list or (call.runs and len(call.runs) > 1)):
                self._batches.pop(call.key, None)
            if call.runs and len(call.runs) > 1:
                self._submitted.setdefault(call.key, set()).update(call.runs)
            return None
        return remediation(list(batch or ()) + list(call.runs or ()))
