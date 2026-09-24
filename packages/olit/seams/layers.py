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
        text = (ROOT / "public/olit.xml").read_text()
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


def olit_passthrough_handlers():
    """Handlers whose whole body is one `return await g.<verb>(...)`."""
    src = (ROOT / "brain/olit/drivers/loop/galaxy_tools.py").read_text()
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


def olit_tool_table():
    sys.path.insert(0, str(ROOT / "brain"))
    from olit.drivers.loop import galaxy_tools as gt

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
    base = ROOT / "brain/olit/registry/skills/galaxy-skills"
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


def _brain():
    sys.path.insert(0, str(ROOT / "brain"))


def llm_request_policy():
    """What an unconfigured request carries. Orbit parity lives here, not in a fingerprint."""
    _brain()
    from olit.substrate.llm import get_adapter
    from olit.substrate.llm.providers import Model, Provider, Target

    bare = Target(Provider(id="p", base_url="http://x"), Model("m"), "http://x", None, 128000, None, 30)
    body = get_adapter("openai-completions").build_request(bare, [], None)
    return {
        # Every field an unconfigured request carries, so a new unconditional one shows up.
        "body_keys": sorted(k for k in body if k != "messages"),
        "sampling": {k: body.get(k) for k in ("max_tokens", "temperature", "tool_choice", "top_p")},
    }


def loop_policy():
    """The numbers that decide how far a turn runs and how much of it survives."""
    _brain()
    from olit import compaction
    from olit.drivers.loop import agent, paging

    return {
        "keep_recent_tokens": compaction.KEEP_RECENT_TOKENS,
        "max_steps": agent.MAX_STEPS,
        "max_tool_result_bytes": agent.MAX_TOOL_RESULT_BYTES,
        "reserve_tokens": compaction.RESERVE_TOKENS,
        "row_bytes_cap": paging.ROW_BYTES_CAP,
        "row_cap": paging.ROW_CAP,
        "tool_execution": agent.TOOL_EXECUTION,
        "tool_result_max_chars": compaction.TOOL_RESULT_MAX_CHARS,
    }


def guard_names():
    """Every Olit guard that can refuse a call, read from the code that names them."""
    found = set()
    for name in ("drivers/loop/tools.py", "drivers/loop/agent.py"):
        tree = ast.parse((ROOT / "brain/olit" / name).read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.keyword) and node.arg == "guard":
                if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
                    found.add(node.value.value)
            if isinstance(node, ast.Dict):
                for key, value in zip(node.keys, node.values):
                    if isinstance(key, ast.Constant) and key.value == "guard":
                        if isinstance(value, ast.Constant) and isinstance(value.value, str):
                            found.add(value.value)
    return sorted(found)


_QUERY_PAIR = re.compile(r"([A-Za-z_][A-Za-z0-9_]*)=([^&?{}\"']*)")


def _literals(node):
    """A dict literal's constant entries; a computed value reads as None, meaning dynamic."""
    out = {}
    for key, value in zip(node.keys, node.values):
        if isinstance(key, ast.Constant):
            out[key.value] = value.value if isinstance(value, ast.Constant) else None
    return out


def _handler_query(node):
    """Query parameters a handler sends, by name, with the value when it is a literal."""
    sent, built = {}, {}
    for inner in ast.walk(node):
        # `params = {...}` then `params["q"] = ...`, the shape most handlers use.
        if isinstance(inner, ast.Assign) and len(inner.targets) == 1:
            target, value = inner.targets[0], inner.value
            if isinstance(target, ast.Name) and isinstance(value, ast.Dict):
                built.setdefault(target.id, {}).update(_literals(value))
            elif (isinstance(target, ast.Subscript) and isinstance(target.value, ast.Name)
                    and isinstance(target.slice, ast.Constant)):
                built.setdefault(target.value.id, {})[target.slice.value] = (
                    value.value if isinstance(value, ast.Constant) else None)
    for inner in ast.walk(node):
        if isinstance(inner, ast.Call) and getattr(inner.func, "id", None) == "_q":
            argument = inner.args[0] if inner.args else None
            if isinstance(argument, ast.Dict):
                sent.update(_literals(argument))
            elif isinstance(argument, ast.Name):
                sent.update(built.get(argument.id, {}))
        # `api/plugins?dataset_id=` and friends: the constant halves of the path itself.
        parts = [inner] if isinstance(inner, ast.Constant) else (
            inner.values if isinstance(inner, ast.JoinedStr) else [])
        for part in parts:
            if isinstance(part, ast.Constant) and isinstance(part.value, str) and "=" in part.value:
                for name, raw in _QUERY_PAIR.findall(part.value.split("?", 1)[-1]):
                    sent.setdefault(name, raw or None)
    return sent


def tool_requests():
    """Tool name -> the Galaxy query it builds. This is where `full=true` was invisible."""
    _brain()
    from olit.drivers.loop import galaxy_tools as gt

    source = ast.parse((ROOT / "brain/olit/drivers/loop/galaxy_tools.py").read_text())
    by_name = {
        node.name: node
        for node in ast.walk(source)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }
    out = {}
    for tool in gt.TOOLS:
        node = by_name.get(tool["handler"].__name__)
        query = _handler_query(node) if node else {}
        if query:
            out[tool["name"]] = dict(sorted(query.items()))
    return out


_JSON_TYPES = {"string": "string", "integer": "integer", "number": "number",
               "boolean": "boolean", "object": "object", "array": "array"}


def tool_contracts():
    """Per tool, the parameter contract in the open plus one fingerprint over all prose."""
    _brain()
    from olit.drivers.loop import galaxy_tools as gt

    out = {}
    for tool in gt.TOOLS:
        fn = tool["schema"].get("function", tool["schema"])
        params = (fn.get("parameters") or {})
        required = set(params.get("required") or [])
        shown, prose = {}, [fn.get("description", "")]
        for name, spec in sorted((params.get("properties") or {}).items()):
            kind = _JSON_TYPES.get(spec.get("type"), spec.get("type") or "any")
            if spec.get("enum"):
                kind += "(" + "|".join(str(e) for e in spec["enum"]) + ")"
            if "default" in spec:
                kind += f"={spec['default']}"
            shown[name] = kind + ("!" if name in required else "")
            prose.append(f"{name}:{spec.get('description', '')}")
        out[tool["name"]] = {"params": shown, "prose": _fp("\n".join(prose))}
    return out
