"""The follow-up message is built by the shell, so a stand-in sends what the browser sends."""

import json
import pathlib
import subprocess

import describe
import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "contract/shell.mjs"
COMPLETED = [{"kind": "job", "id": "j1", "label": "Galaxy job j1", "outcome": "completed"}]
FAILED = [{"kind": "invocation", "id": "i1", "label": "Workflow invocation i1", "outcome": "failed"}]

needs_node = pytest.mark.skipif(
    not describe.strips_types(), reason="needs a node that reads TypeScript: it runs the shell's own module"
)


def _ask(runs=None):
    stated = subprocess.run(
        ["node", "--experimental-strip-types", str(SCRIPT)],
        input=json.dumps(runs) if runs else "",
        capture_output=True,
        text=True,
    )
    assert stated.returncode == 0, stated.stderr
    return json.loads(stated.stdout)


@needs_node
def test_the_cap_on_automatic_turns_comes_from_the_shell():
    assert _ask()["max_auto_follow_ups"] == 3


@needs_node
def test_a_settled_run_is_named_in_the_message_it_produces():
    prompt = _ask(COMPLETED)["resume_prompt"]

    assert prompt.startswith("[Olit automatic Galaxy follow-up]")
    assert '"id": "j1"' in prompt


@needs_node
def test_a_failed_run_carries_the_warning_a_completed_one_does_not():
    """The sentence a stand-in reconstructing this text by hand never reproduced."""
    assert "still have jobs running" in _ask(FAILED)["resume_prompt"]
    assert "still have jobs running" not in _ask(COMPLETED)["resume_prompt"]
