"""Galaxy readiness as the brain reports it, next to the prompt block the model reads for it.

The shell's approval gate and the model's instructions must agree about whether Galaxy can run
any of a plan's steps. Both derive from `Session._galaxy_status()`; this emits the pair so the
shell's suite can hold them together.

Run as a script to print `{status: {...}}` as JSON.
"""

import json
import pathlib
import sys

if __name__ == "__main__":  # pragma: no cover - the script form the shell's suite calls
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from olit import prompt

STATUSES = (prompt.GALAXY_READY, prompt.GALAXY_UNREACHABLE, prompt.OPS_UNAVAILABLE)


def produce():
    """Per status: the value `diagnostics()` carries and which Galaxy block the prompt assembles."""
    out = {}
    for status in STATUSES:
        text = prompt.system_text(model="m", provider="p", galaxy_status=status)
        out[status] = {
            "status": status,
            "says_nothing_can_run": prompt.GALAXY_UNAVAILABLE in text,
            "says_partly_available": prompt.GALAXY_PARTLY_AVAILABLE in text,
        }
    return out


if __name__ == "__main__":  # pragma: no cover
    print(json.dumps(produce(), indent=1))
