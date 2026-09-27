"""A shell that refuses its parameters names the subject, not just the condition.

`ValidationError` is a code plus details. The code says what is wrong; the details say which
encoding, column or type it is about. Nothing at runtime reads a code, so a site that emits one
without its details is silently useless: the planner is told "invalid_field_type" and cannot tell
which field. This holds every emission site to the details its code requires, and fails on a code
outside the declared vocabulary or one the shells no longer emit.
"""

import ast
import pathlib
from typing import get_args, get_type_hints

from olit.registry.extensions.vintent.modules import schemas
from olit.registry.extensions.vintent.modules.shells import base

# What each code must say about its subject. A planner re-asked for a field needs the encoding to
# re-ask about; a derived column is the pipeline's, so it has no encoding.
REQUIRED_DETAILS = {
    "missing_required_encoding": {"encoding"},
    "unknown_field": {"encoding", "field"},
    "invalid_field_type": {"encoding", "field", "expected", "actual"},
    "missing_derived_field": {"field"},
    "invalid_derived_field_type": {"field", "expected", "actual"},
    "not_enough_fields": {"field_type", "required", "found"},
}

DECLARED = set(get_args(get_type_hints(schemas.ValidationError)["code"]))
# Warnings share the `{"code": ...}` shape and their own vocabulary, so they are read off and skipped
# rather than filtered by name; an invented error code stays visible to the check below.
WARNINGS = set(get_args(get_type_hints(schemas.ValidationWarning)["code"]))


def _emissions() -> list[tuple[str, int, str, set[str] | None]]:
    """Every `{"code": ..., "details": {...}}` literal in the shells, as (file, line, code, keys)."""
    found = []
    for path in sorted(pathlib.Path(base.__file__).parent.parent.rglob("*.py")):
        for node in ast.walk(ast.parse(path.read_text())):
            if not isinstance(node, ast.Dict):
                continue
            entries = {
                key.value: value
                for key, value in zip(node.keys, node.values)
                if isinstance(key, ast.Constant) and isinstance(key.value, str)
            }
            code = entries.get("code")
            if not isinstance(code, ast.Constant) or code.value in WARNINGS:
                continue
            details = entries.get("details")
            keys = None
            if isinstance(details, ast.Dict):
                keys = {k.value for k in details.keys if isinstance(k, ast.Constant)}
            found.append((path.name, node.lineno, code.value, keys))
    return found


def test_the_shells_emit_only_declared_codes():
    unknown = sorted({(f, line, code) for f, line, code, _ in _emissions() if code not in DECLARED})
    assert not unknown, f"codes outside ValidationError: {unknown}"


def test_every_declared_code_is_emitted_somewhere():
    """A code no shell emits cannot be handled, so it is vocabulary that only looks like contract."""
    emitted = {code for _, _, code, _ in _emissions()}
    assert DECLARED - emitted == set(), f"declared but never emitted: {sorted(DECLARED - emitted)}"


def test_every_emission_carries_the_details_its_code_requires():
    incomplete = []
    for name, line, code, keys in _emissions():
        if code not in REQUIRED_DETAILS:
            continue
        if keys is None:
            incomplete.append(f"{name}:{line} {code} has no details literal")
            continue
        absent = REQUIRED_DETAILS[code] - keys
        if absent:
            incomplete.append(f"{name}:{line} {code} omits {sorted(absent)}")
    assert not incomplete, "\n".join(incomplete)


def test_the_declared_vocabulary_matches_the_required_details_table():
    """The table above is this test's own reading of the contract; drift makes it check nothing."""
    assert set(REQUIRED_DETAILS) == DECLARED
