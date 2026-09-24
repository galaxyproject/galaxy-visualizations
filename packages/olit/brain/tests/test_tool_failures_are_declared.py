"""A tool that fails says so, rather than returning a payload that reads like one.

`is_error` decides three things: how the step renders, whether the repeated-failure guard
counts the call, and how a restored session replays it. Inferring it from a payload key
would make all three depend on a shape no caller can see, so the status is declared at the
handler and this test holds the loop's handlers to that.
"""

import ast
import pathlib

from olit.drivers.loop import ena, galaxy_tools, gtn, notebook

LOOP = pathlib.Path(galaxy_tools.__file__).parent

# Where a dispatched handler lives; the graph engine and the catalog answer in their own shape.
MODULES = ("ena.py", "galaxy_tools.py", "gtn.py", "notebook.py")


def dispatched_handlers():
    """The functions a tool call actually reaches, by name."""
    names = set()
    for module in (ena, galaxy_tools, gtn, notebook):
        names |= {f.__name__ for f in module.HANDLERS.values()}
    return names


def undeclared_failures():
    """Returns of an error-shaped dict from a handler, outside a ToolOutcome."""
    handlers = dispatched_handlers()
    found = []
    for name in MODULES:
        path = LOOP / name
        tree = ast.parse(path.read_text())
        owners = [
            (n.lineno, n.end_lineno, n.name)
            for n in ast.walk(tree)
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
        ]
        for node in ast.walk(tree):
            if not isinstance(node, ast.Return) or not isinstance(node.value, ast.Dict):
                continue
            keys = [k.value for k in node.value.keys if isinstance(k, ast.Constant)]
            if "error" not in keys:
                continue
            owner = max((a, b, n) for a, b, n in owners if a <= node.lineno <= b)[2]
            if owner in handlers:
                found.append(f"{name}:{node.lineno} in {owner}")
    return found


def test_a_handler_never_returns_a_failure_as_a_plain_dict():
    undeclared = undeclared_failures()
    assert not undeclared, (
        "these return an error-shaped dict that dispatch records as a success; wrap them in "
        "ToolOutcome(payload, is_error=True):\n  " + "\n  ".join(undeclared)
    )


def test_the_check_can_see_a_handler_that_forgets():
    """The guard above is worthless if it cannot fail, so prove it reads what it claims to."""
    handlers = dispatched_handlers()
    assert handlers, "no dispatched handlers found; the check would pass vacuously"
    assert "_gtn_fetch" in handlers and "_run_tool" in handlers
