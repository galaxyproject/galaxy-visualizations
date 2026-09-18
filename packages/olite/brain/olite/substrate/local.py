"""Local compute: run Python in the same Pyodide interpreter the brain runs in."""

import ast
import contextlib
import copy
import io
import traceback


class LocalExecutionError(Exception):
    """Code that raised, carrying what it printed before it did."""


class LocalPython:
    def __init__(self, manifest):
        self._manifest = manifest
        self._ns = {}

    def scoped(self, manifest):
        """A view gated by a narrower manifest, sharing the SAME namespace."""
        view = copy.copy(self)
        view._manifest = manifest
        return view

    def run(self, code):
        self._manifest.require("local")
        buffer = io.StringIO()
        result = None
        failure = None
        try:
            with contextlib.redirect_stdout(buffer):
                parsed = ast.parse(code)
                if parsed.body and isinstance(parsed.body[-1], ast.Expr):
                    last = parsed.body.pop()
                    exec(compile(parsed, "<olite>", "exec"), self._ns)
                    result = eval(compile(ast.Expression(last.value), "<olite>", "eval"), self._ns)
                else:
                    exec(compile(parsed, "<olite>", "exec"), self._ns)
        except Exception as exc:
            failure = _failure_text(exc)
        out = buffer.getvalue()
        parts = []
        if out.strip():
            parts.append(out.rstrip())
        if result is not None:
            parts.append(repr(result))
        if failure is not None:
            # Keep what ran before the failure; it says how far the code got.
            raise LocalExecutionError("\n\n".join(parts + [failure]))
        return "\n".join(parts) if parts else "(no output)"


def _failure_text(exc):
    """The traceback without this module's own frames."""
    frames = [f for f in traceback.extract_tb(exc.__traceback__) if f.filename == "<olite>"]
    lines = []
    if frames:
        lines.append("Traceback (most recent call last):\n")
        lines += traceback.format_list(frames)
    lines += traceback.format_exception_only(type(exc), exc)
    return "".join(lines).rstrip()
