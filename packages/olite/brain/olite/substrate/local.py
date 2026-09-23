"""Local compute: run Python in the same Pyodide interpreter the brain runs in.

Execution is async so the code may use top-level `await`, which is what gives it the
browser's own fetch. Network reach is therefore the page's: subject to CORS, unlike a
shell's curl.
"""

import ast
import contextlib
import copy
import inspect
import io
import traceback

try:  # Pyodide supplies both; CPython (the test environment) supplies neither.
    from pyodide.code import eval_code_async
except ImportError:
    eval_code_async = None

try:
    from pyodide.http import pyfetch
except ImportError:
    pyfetch = None

TOP_LEVEL_AWAIT = ast.PyCF_ALLOW_TOP_LEVEL_AWAIT


class LocalExecutionError(Exception):
    """Code that raised, carrying what it printed before it did."""


async def _eval_top_level_await(code, namespace):
    """What `eval_code_async` does, for the interpreter that does not ship it."""
    parsed = ast.parse(code)
    last = parsed.body.pop() if parsed.body and isinstance(parsed.body[-1], ast.Expr) else None
    pending = eval(compile(parsed, "<olite>", "exec", flags=TOP_LEVEL_AWAIT), namespace)
    if inspect.isawaitable(pending):
        await pending
    if last is None:
        return None
    value = eval(compile(ast.Expression(last.value), "<olite>", "eval", flags=TOP_LEVEL_AWAIT),
                 namespace)
    return await value if inspect.isawaitable(value) else value


class LocalPython:
    def __init__(self, manifest):
        self._manifest = manifest
        # `pyfetch` is seeded rather than imported by the caller, so a network call is one
        # line and the tool description can promise it without also teaching the import.
        self._ns = {"pyfetch": pyfetch} if pyfetch else {}

    def scoped(self, manifest):
        """A view gated by a narrower manifest, sharing the SAME namespace."""
        view = copy.copy(self)
        view._manifest = manifest
        return view

    async def run(self, code):
        self._manifest.require("local")
        buffer = io.StringIO()
        result = None
        failure = None
        try:
            with contextlib.redirect_stdout(buffer):
                if eval_code_async is not None:
                    result = await eval_code_async(code, globals=self._ns, filename="<olite>")
                else:
                    result = await _eval_top_level_await(code, self._ns)
        except Exception as exc:
            failure = _failure_text(exc)
        out = buffer.getvalue()
        parts = []
        if out.strip():
            parts.append(out.rstrip())
        if result is not None:
            parts.append(repr(result))
        if failure is not None:
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
