"""Every guard the code can set has to appear in the published policy.

The inventory used to name two modules explicitly, so `malformed-object-id` -- set in
galaxy_tools.py and observed refusing live -- was absent from the policy and from the drift
check that reads it. A guard nothing reports cannot be seen in a trajectory.
"""

import ast
import pathlib

from olit import describe


def guards_named_in_the_source():
    """Every `guard=` literal anywhere in the loop, found without consulting describe."""
    found = set()
    root = pathlib.Path(describe.__file__).resolve().parent / "drivers" / "loop"
    for path in root.rglob("*.py"):
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.keyword) and node.arg == "guard":
                if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
                    found.add(node.value.value)
    return found


def test_the_policy_reports_every_guard_the_code_sets():
    missing = sorted(guards_named_in_the_source() - set(describe.guards()))
    assert not missing, f"set in the code but absent from the published policy: {missing}"


def test_the_policy_reports_no_guard_the_code_does_not_set():
    """A stale name would let an eval expect a refusal nothing can produce."""
    # max-steps is a cap the loop reports rather than a `guard=` keyword, so it is expected here.
    extra = sorted(set(describe.guards()) - guards_named_in_the_source() - {"max-steps"})
    assert not extra, f"published but never set: {extra}"


def test_the_guard_observed_refusing_live_is_among_them():
    """viz-structure-saved refused four times on this guard; it must be visible."""
    assert "malformed-object-id" in describe.guards()


def test_discovery_reads_the_package_rather_than_a_list_of_files():
    """A guard in a module nobody listed is the failure this replaced."""
    scanned = {p.name for p in describe.guard_modules()}
    assert {"tools.py", "agent.py", "galaxy_tools.py"} <= scanned
