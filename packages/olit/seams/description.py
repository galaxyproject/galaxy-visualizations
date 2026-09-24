"""The description an agent publishes about itself, and the views this registry reads it through.

Nothing here parses the agent's source. A checkout is asked for its description; a JSON file
is read as one. Everything below is a projection of that document.
"""

import json
import os
import pathlib
import subprocess
import sys

# How an agent is asked to describe itself, by name.
DESCRIBE = {"olit": ("brain", "olit.describe")}


def load(source=None, agent="olit"):
    """A description, from a JSON file or from a checkout that can produce one."""
    source = source or os.environ.get("AGENT_DESCRIPTION") or os.environ.get("OLIT_ROOT")
    if source is None:
        raise SystemExit("no agent description: set AGENT_DESCRIPTION to a file or a checkout")
    path = pathlib.Path(source).expanduser().resolve()
    if path.is_file():
        return json.loads(path.read_text())
    package, module = DESCRIBE[agent]
    out = subprocess.run([sys.executable, "-m", module, "--root", str(path)],
                         cwd=path / package, capture_output=True, text=True)
    if out.returncode:
        raise SystemExit(f"{agent} could not describe itself:\n{out.stderr}")
    return json.loads(out.stdout)


def defines(description, module, symbol):
    """Whether the agent still defines this symbol in this module."""
    key = "olit/" + module.split("brain/olit/", 1)[-1]
    return symbol in (description["symbols"].get(key) or [])


def tool_table(description):
    """name -> fingerprint of (description, parameter names), for comparison upstream."""
    return {name: tool["signature"] for name, tool in description["tools"].items()}


def passthrough_handlers(description):
    return {name for name, tool in description["tools"].items() if tool["passthrough"]}


def tool_requests(description):
    return {name: tool["query"] for name, tool in description["tools"].items() if tool["query"]}


def tool_contracts(description):
    return {name: {"params": tool["params"], "prose": tool["prose"]}
            for name, tool in description["tools"].items()}


def policy(description, name):
    return description["policy"]["guards" if name == "guards" else name]
