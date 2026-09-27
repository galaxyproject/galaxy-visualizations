"""The shells' extension points are declared on the base, not discovered on each subclass.

`processes` was `= None` on BaseShell while 20 of the 32 shells defined it as a method, so the
base offered no contract for its main extension point and the caller had to test callability
before using it. mypy reported the disagreement once per shell.
"""

import inspect

from olit.registry.extensions.vintent.modules.registry import SHELLS
from olit.registry.extensions.vintent.modules.shells.base import BaseShell


def test_the_base_declares_processes_as_a_method():
    assert callable(BaseShell.processes), "processes is the extension point; the base must declare it"
    parameters = list(inspect.signature(BaseShell.processes).parameters)
    assert parameters == ["self", "profile", "params"]


def test_a_shell_that_declares_no_processes_runs_none():
    """The 12 shells that add no analyze step inherit an empty list rather than a None nobody
    may call."""
    assert BaseShell().processes({"fields": {}, "row_count": 0}, {}) == []


def test_every_shell_answers_processes_with_the_same_signature():
    """One signature across all 32, so the caller can just call it.

    Not called here: 12 of them index a required param, and they are entitled to, because
    `fill_shell_params` generates a schema marking those required and the planner validates
    against it before analyze runs.
    """
    for shell_id, shell in sorted(SHELLS.items()):
        assert callable(shell.processes), f"{shell_id} does not answer processes"
        parameters = list(inspect.signature(shell.processes).parameters)
        assert parameters == ["profile", "params"], f"{shell_id} takes {parameters}"


def test_the_caller_does_not_test_for_callability_any_more():
    """The `callable()` check existed only because the base said None; a stale check would hide a
    shell that stopped answering."""
    import pathlib

    from olit.registry.extensions import vintent

    bridge = (pathlib.Path(vintent.__file__).parent / "bridge.py").read_text()
    assert 'getattr(shell, "processes"' not in bridge
    assert "shell.processes(" in bridge
