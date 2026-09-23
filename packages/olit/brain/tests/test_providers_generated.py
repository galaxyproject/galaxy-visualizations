"""The picker's provider list is generated from the registry; keep them in step.

src/providers.generated.json is committed so the front end typechecks without a
build, which means it can drift from providers.py. This fails when it does.
"""

import json
import pathlib
import subprocess
import sys

BRAIN = pathlib.Path(__file__).resolve().parents[1]
GENERATED = BRAIN.parent / "src" / "providers.generated.json"


def test_the_generated_provider_list_matches_the_registry():
    before = GENERATED.read_text()
    subprocess.run(
        [sys.executable, "scripts/dump_providers.py"], cwd=BRAIN, check=True, capture_output=True
    )
    after = GENERATED.read_text()
    if before != after:
        GENERATED.write_text(before)  # leave the tree as we found it
        raise AssertionError(
            "src/providers.generated.json is stale -- run `npm run build:providers` and commit it"
        )


def test_every_generated_provider_states_whether_it_needs_a_key():
    entries = json.loads(GENERATED.read_text())
    assert entries, "no providers generated"
    for e in entries:
        assert isinstance(e["needs_key"], bool), e["id"]
