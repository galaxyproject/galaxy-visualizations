"""Whole-layer seams: things compared as a *set* rather than symbol by symbol.

The per-symbol rows in registry.json cover prompt text. These cover the three layers that
were audited by hand and would otherwise rot the same way the prompt audit did: loom's eval
scenarios, the Galaxy tool surface, and the vendored skills corpus.

Each layer stores the upstream state it was certified against, so `check.py` runs offline.
Refreshing that state (`--refresh`) is the deliberate act of re-certifying.
"""

import ast
import hashlib
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import extract  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent


def _fp(text):
    return hashlib.sha256(" ".join((text or "").split()).encode()).hexdigest()[:16]


def identity_prompt():
    """Fingerprint the ai_prompt Galaxy hands the model; the ORPHAN check stops at the brain."""
    try:
        text = (ROOT / "public/olite.xml").read_text()
    except OSError:
        return {}
    found = re.search(r"<ai_prompt>\s*<!\[CDATA\[(.*?)\]\]>\s*</ai_prompt>", text, re.S)
    return {"fingerprint": _fp(found.group(1))} if found else {}


def loom_scenarios(loom_root):
    """Fingerprint every loom scenario, so a changed or added scenario is visible."""
    out = {}
    base = pathlib.Path(loom_root) / "evals/scenarios"
    for d in sorted(p for p in base.iterdir() if p.is_dir()):
        f = d / "scenario.json"
        if f.exists():
            out[d.name] = _fp(f.read_text())
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


def olite_passthrough_handlers():
    """Handlers whose whole body is one `return await g.<verb>(...)`."""
    src = (ROOT / "brain/olite/drivers/loop/galaxy_tools.py").read_text()
    tree = ast.parse(src)
    out = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.AsyncFunctionDef) or not node.name.startswith("_"):
            continue
        body = [n for n in node.body if not isinstance(n, ast.Expr)
                or not isinstance(getattr(n, "value", None), ast.Constant)]
        if len(body) != 1 or not isinstance(body[0], ast.Return):
            continue
        value = body[0].value
        if isinstance(value, ast.Await) and isinstance(value.value, ast.Call):
            func = value.value.func
            if isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name) and func.value.id == "g":
                out.add(node.name.lstrip("_"))
    return out


def olite_tool_table():
    sys.path.insert(0, str(ROOT / "brain"))
    from olite.drivers.loop import galaxy_tools as gt

    out = {}
    for t in gt.TOOLS:
        fn = t["schema"].get("function", t["schema"])
        desc = fn.get("description", "")
        props = sorted((fn.get("parameters") or {}).get("properties") or {})
        out[t["name"]] = _fp(desc + "|" + ",".join(props))
    return out


def skills_manifest():
    """The vendored Orbit corpus: lock pin plus a hash per file.

    The corpus is a build artifact (`npm run build:skills`, gitignored); only
    `skills.lock.json` is committed. `vendored` says whether it is present, so a checkout
    that has not been built is not mistaken for a corpus someone deleted.
    """
    lock = json.loads((ROOT / "skills.lock.json").read_text())
    base = ROOT / "brain/olite/registry/skills/galaxy-skills"
    files = {}
    for f in sorted(base.rglob("*.md")):
        files[str(f.relative_to(base))] = hashlib.sha256(f.read_bytes()).hexdigest()[:16]
    return {
        "repo": lock["repo"],
        "ref": lock["ref"],
        "sha": lock["sha"],
        "vendored": base.is_dir() and bool(files),
        "files": files,
    }


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
    # Version pin plus a fingerprint per tracked loop file. olite's driver is a port of this
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
