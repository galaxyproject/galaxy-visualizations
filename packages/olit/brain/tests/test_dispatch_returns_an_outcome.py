"""Every dispatch path says whether it failed.

`dispatch` used to wrap a bare return in a default ToolOutcome, which reads as success. That
is how ten handlers' refusals reached the model as a serialised Python repr with is_error
false, so the repeated-failure guard never counted them. A path that cannot express failure
should not exist.
"""

import ast
import asyncio
import pathlib

from olit.drivers.loop import tools as tools_module
from olit.drivers.loop.outcome import ToolOutcome
from olit.drivers.loop.tools import ToolSurface

from .fakes import FakeOps, FakeSubstrate


def _guarded_by_isinstance(fn, ret):
    """Whether `ret` sits under an `if isinstance(x, ToolOutcome):` -- already an outcome."""
    for node in ast.walk(fn):
        if not isinstance(node, ast.If):
            continue
        test = node.test
        if not (isinstance(test, ast.Call) and isinstance(test.func, ast.Name) and test.func.id == "isinstance"):
            continue
        if not any(isinstance(a, ast.Name) and a.id == "ToolOutcome" for a in test.args):
            continue
        if any(r is ret for r in ast.walk(node)):
            return True
    return False


def _returns_of(function_name):
    tree = ast.parse(pathlib.Path(tools_module.__file__).read_text())
    fn = next(
        n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == function_name
    )
    return [
        r
        for r in ast.walk(fn)
        if isinstance(r, ast.Return) and r.value is not None and not _guarded_by_isinstance(fn, r)
    ]


def _is_outcome_expression(node):
    """A ToolOutcome, or a call that this module guarantees returns one."""
    inner = node.value if isinstance(node, ast.Await) else node
    if isinstance(inner, ast.Call):
        func = inner.func
        if isinstance(func, ast.Name) and func.id == "ToolOutcome":
            return True
        if isinstance(func, ast.Attribute) and func.attr in {
            "_dispatch",
            "_run_process",
            "_run_delegated",
            "_skills_fetch",
        }:
            return True
    return False


def test_every_dispatch_return_is_an_outcome():
    offenders = [
        (r.lineno, ast.dump(r.value)[:70]) for r in _returns_of("_dispatch") if not _is_outcome_expression(r.value)
    ]
    assert not offenders, f"these return a bare value, which reads as success: {offenders}"


def test_every_helper_dispatch_delegates_to_returns_an_outcome():
    for helper in ("_run_process", "_run_delegated", "_skills_fetch"):
        offenders = [(helper, r.lineno) for r in _returns_of(helper) if not _is_outcome_expression(r.value)]
        assert not offenders, f"{helper} can return a bare value: {offenders}"


def test_dispatch_no_longer_normalises_a_bare_return():
    """The wrapping branch is what made a bare failure indistinguishable from a success."""
    source = pathlib.Path(tools_module.__file__).read_text()
    assert "else ToolOutcome(result)" not in source


def test_a_successful_call_still_reads_as_success():
    surface = ToolSurface(
        FakeSubstrate(ops=FakeOps(lambda n, a: [{"id": "h1"}]), capabilities=("llm", "local", "read"))
    )
    out = asyncio.run(surface.dispatch("get_histories", {"limit": 1}))
    assert isinstance(out, ToolOutcome) and not out.is_error
