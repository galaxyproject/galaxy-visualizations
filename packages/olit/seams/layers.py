"""Upstream state, fingerprinted as a set: loom, galaxy-mcp and the agent loop olit ports.

The agent's own side of every layer comes from its description, never from its source.
Each layer stores the upstream state it was certified against, so `check.py` runs offline.
"""

import ast
import hashlib
import json
import pathlib


def _fp(text):
    return hashlib.sha256(" ".join((text or "").split()).encode()).hexdigest()[:16]


def loom_scenarios(loom_root):
    """Fingerprint every loom scenario, so a changed or added scenario is visible."""
    out = {}
    base = pathlib.Path(loom_root) / "evals/scenarios"
    for d in sorted(p for p in base.iterdir() if p.is_dir()):
        f = d / "scenario.json"
        if f.exists():
            out[d.name] = _fp(f.read_text())
    return out


def loom_modules(loom_root):
    """Fingerprint every loom extension module, so a new one is visible before it is needed.

    Not a parity list: most of these are Electron-shaped. The point is that an addition
    gets classified deliberately instead of going unnoticed.
    """
    out = {}
    base = pathlib.Path(loom_root) / "extensions/loom"
    for f in sorted(base.glob("*.ts")):
        if f.name.endswith(".test.ts"):
            continue
        out[f.stem] = _fp(f.read_text())
    return out


def loom_eval_lib(loom_root):
    """Fingerprint loom's grading and normalization, which is eval parity of its own."""
    out = {}
    base = pathlib.Path(loom_root) / "evals/lib"
    if not base.is_dir():
        return out
    for f in sorted(base.glob("*.ts")):
        out[f.stem] = _fp(f.read_text())
    return out


def mcp_tool_table(server_py):
    """name -> fingerprint of (description, parameter names) for each @mcp.tool."""
    tree = ast.parse(pathlib.Path(server_py).read_text())
    out = {}
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if any("tool" in ast.unparse(d) for d in node.decorator_list):
                doc = (ast.get_docstring(node) or "").strip()
                args = sorted(a.arg for a in node.args.args if a.arg != "self")
                out[node.name] = _fp(doc + "|" + ",".join(args))
    return out


def mcp_shaped_returns(server_py):
    """Tools where galaxy-mcp constructs a result rather than passing the response through.

    The tool tables fingerprint description and parameters, so a tool can keep both and
    still return something else entirely. That is how get_tool_input_template shipped
    galaxy-mcp's "ready-to-fill skeleton" text over a raw schema passthrough.
    """
    tree = ast.parse(pathlib.Path(server_py).read_text())
    out = {}
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if not any("tool" in ast.unparse(d) for d in node.decorator_list):
            continue
        for call in ast.walk(node):
            if not isinstance(call, ast.Call):
                continue
            for kw in call.keywords:
                if kw.arg == "data" and isinstance(kw.value, ast.Dict):
                    keys = sorted(k.value for k in kw.value.keys
                                  if isinstance(k, ast.Constant) and isinstance(k.value, str))
                    if keys:
                        out[node.name] = keys
    return out


PI_TRACKED = ["dist/agent-loop.js", "dist/agent.js", "dist/harness/agent-harness.js"]


def pi_core_root(loom_root):
    # pi-agent-core as loom resolves it; it is nested under pi-coding-agent.
    base = pathlib.Path(loom_root) / "node_modules/@earendil-works"
    for cand in (
        base / "pi-coding-agent/node_modules/@earendil-works/pi-agent-core",
        base / "pi-agent-core",
    ):
        if (cand / "package.json").exists():
            return cand
    return None


def pi_manifest(loom_root):
    # Version pin plus a fingerprint per tracked loop file. olit's driver is a port of this
    # loop, and it was the least watched component in the system: Orbit's own source got six
    # enumerated layers, the agent loop it runs on got one off-line audit.
    root = pi_core_root(loom_root)
    if root is None:
        return None
    version = json.loads((root / "package.json").read_text())["version"]
    files = {}
    for rel in PI_TRACKED:
        f = root / rel
        if f.exists():
            files[rel] = _fp(f.read_text(errors="replace"))
    return {"package": "@earendil-works/pi-agent-core", "version": version, "files": files}
