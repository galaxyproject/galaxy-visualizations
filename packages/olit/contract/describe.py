"""The surface olit exposes, as data.

Everything an outside evaluator needs to judge olit without reading its source: the tools
the model is shown, the Galaxy queries they build, the guards that can refuse a call, the
sampling and loop policy, the prompt symbols, and the vendored skills pin.

    python3 contract/describe.py --root .
"""

import argparse
import ast
import hashlib
import inspect
import json
import pathlib
import re
import shutil
import subprocess
import sys

# The brain is the sibling this reports on, not something this is part of.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "brain"))

from olit import compaction, prompt  # noqa: E402
from olit.loop import agent, galaxy_tools, paging  # noqa: E402

SCHEMA = 1

# Where the system prompt is composed; its blocks are named separately.
PROMPT_MODULE = "prompt.py"

# The script that answers for the shell's follow-up contract, run from the checkout root.
SHELL_CONTRACT = "contract/shell.mjs"

# Excluded from the symbol table: contracts owned elsewhere, and the vendored corpus.
SKIPPED = ("vendor/", "skills/")

# Modules that name the guards able to refuse a call.
# Where a guard can be named. Scanned rather than listed: a guard set in a module nobody
# thought to list is invisible here, to the published policy and to the drift check that
# reads it -- which is how `malformed-object-id` went unreported.
GUARD_PACKAGES = ("loop",)

_QUERY_PAIR = re.compile(r"([A-Za-z_][A-Za-z0-9_]*)=([^&?{}\"']*)")

_JSON_TYPES = {
    "string": "string",
    "integer": "integer",
    "number": "number",
    "boolean": "boolean",
    "object": "object",
    "array": "array",
}


def fingerprint(text):
    """Whitespace-normalised hash: reflowing a paragraph is not a semantic change."""
    return hashlib.sha256(" ".join((text or "").split()).encode()).hexdigest()[:16]


def package_root():
    return pathlib.Path(inspect.getsourcefile(prompt)).resolve().parent


def symbols():
    """Every module-level name olit defines, by module. Presence is what a seam asks about."""
    out = {}
    base = package_root()
    for f in sorted(base.rglob("*.py")):
        rel = f.relative_to(base).as_posix()
        if any(rel.startswith(s) for s in SKIPPED):
            continue
        names = set()
        for node in ast.parse(f.read_text()).body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                names.add(node.name)
            elif isinstance(node, ast.Assign):
                names.update(t.id for t in node.targets if isinstance(t, ast.Name))
        if names:
            out[f"olit/{rel}"] = sorted(names)
    return dict(sorted(out.items()))


def prompt_blocks():
    """The named blocks the system prompt is composed from."""
    text = (package_root() / PROMPT_MODULE).read_text()
    names = re.findall(r'^([A-Z][A-Z_0-9]{2,}) = (?:"""|\'\'\')', text, re.M)
    names += re.findall(r"^def ([a-z_]+_block)\(", text, re.M)
    return sorted(set(names))


def identity_prompt(root):
    """The ai_prompt Galaxy hands the model, which lives in the plugin manifest."""
    if root is None:
        return {}
    try:
        text = (pathlib.Path(root) / "public/olit.xml").read_text()
    except OSError:
        return {}
    found = re.search(r"<ai_prompt>\s*<!\[CDATA\[(.*?)\]\]>\s*</ai_prompt>", text, re.S)
    return {"fingerprint": fingerprint(found.group(1))} if found else {}


def _handler_trees():
    """Parsed sources of every module that defines a registered handler.

    Taken from the handlers themselves, so extracting a domain into its own module keeps its
    query and passthrough metadata instead of quietly dropping it.
    """
    modules = {t["handler"].__module__ for t in galaxy_tools.TOOLS if t["handler"] is not None}
    trees = []
    for name in sorted(modules):
        relative = pathlib.Path(*name.split(".")[1:]).with_suffix(".py")
        trees.append(ast.parse((package_root() / relative).read_text()))
    return trees


def _passthrough_handlers():
    """Handlers whose whole body is one `return await g.<verb>(...)`."""
    out = set()
    for node in (n for tree in _handler_trees() for n in ast.walk(tree)):
        if not isinstance(node, ast.AsyncFunctionDef) or not node.name.startswith("_"):
            continue
        body = [
            n
            for n in node.body
            if not isinstance(n, ast.Expr) or not isinstance(getattr(n, "value", None), ast.Constant)
        ]
        if len(body) != 1 or not isinstance(body[0], ast.Return):
            continue
        value = body[0].value
        if isinstance(value, ast.Await) and isinstance(value.value, ast.Call):
            func = value.value.func
            if isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name) and func.value.id == "g":
                out.add(node.name.lstrip("_"))
    return out


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
            elif (
                isinstance(target, ast.Subscript)
                and isinstance(target.value, ast.Name)
                and isinstance(target.slice, ast.Constant)
            ):
                built.setdefault(target.value.id, {})[target.slice.value] = (
                    value.value if isinstance(value, ast.Constant) else None
                )
    for inner in ast.walk(node):
        if isinstance(inner, ast.Call) and getattr(inner.func, "id", None) == "_q":
            argument = inner.args[0] if inner.args else None
            if isinstance(argument, ast.Dict):
                sent.update(_literals(argument))
            elif isinstance(argument, ast.Name):
                sent.update(built.get(argument.id, {}))
        # `api/plugins?dataset_id=` and friends: the constant halves of the path itself.
        parts = (
            [inner] if isinstance(inner, ast.Constant) else (inner.values if isinstance(inner, ast.JoinedStr) else [])
        )
        for part in parts:
            if isinstance(part, ast.Constant) and isinstance(part.value, str) and "=" in part.value:
                for name, raw in _QUERY_PAIR.findall(part.value.split("?", 1)[-1]):
                    sent.setdefault(name, raw or None)
    return sent


def tools():
    """Per tool: what the model is shown, the query it builds, and how it answers."""
    by_name = {
        node.name: node
        for tree in _handler_trees()
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }
    passthrough = _passthrough_handlers()
    out = {}
    for tool in galaxy_tools.TOOLS:
        fn = tool["schema"].get("function", tool["schema"])
        params = fn.get("parameters") or {}
        required = set(params.get("required") or [])
        properties = params.get("properties") or {}
        shown, prose = {}, [fn.get("description", "")]
        for name, spec in sorted(properties.items()):
            kind = _JSON_TYPES.get(spec.get("type"), spec.get("type") or "any")
            if spec.get("enum"):
                kind += "(" + "|".join(str(e) for e in spec["enum"]) + ")"
            if "default" in spec:
                kind += f"={spec['default']}"
            shown[name] = kind + ("!" if name in required else "")
            prose.append(f"{name}:{spec.get('description', '')}")
        # A tool with no handler is run by galaxy-ops, so the query it builds is not olit's
        # to state and there is no local body to call a passthrough.
        handler = tool["handler"]
        node = by_name.get(handler.__name__) if handler is not None else None
        query = _handler_query(node) if node else {}
        out[tool["name"]] = {
            "capability": tool["capability"],
            "runner": "olit" if handler is not None else "galaxy-ops",
            "signature": fingerprint(fn.get("description", "") + "|" + ",".join(sorted(properties))),
            "params": shown,
            "prose": fingerprint("\n".join(prose)),
            "query": dict(sorted(query.items())),
            "passthrough": handler is not None and tool["name"] in passthrough,
            "promised_fields": list(galaxy_tools.promised_fields(tool["name"])),
        }
    return dict(sorted(out.items()))


def guard_modules():
    """Every module a guard could be named in, so none is missed by omission."""
    base = package_root()
    return sorted(p for package in GUARD_PACKAGES for p in (base / package).glob("*.py"))


def guards():
    """Every guard that can refuse a call, read from the code that names them."""
    found = set()
    for path in guard_modules():
        tree = ast.parse(path.read_text())
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


def llm_request():
    """What an unconfigured request carries, so a new unconditional field shows up.

    Reported twice, because some fields only appear once tools are attached: `tool_choice` is
    invisible to a request built without them, and it is one an agent must leave to the
    provider rather than announce for itself.
    """
    from olit.substrate.llm import get_adapter
    from olit.substrate.llm.providers import Model, Provider, Target

    bare = Target(Provider(id="p", base_url="http://x"), Model("m"), "http://x", None, 128000, None, 30)
    adapter = get_adapter("openai-completions")
    body = adapter.build_request(bare, [], None)
    with_tools = adapter.build_request(bare, [], [{"type": "function", "function": {"name": "finish"}}])
    return {
        "body_keys": sorted(k for k in body if k != "messages"),
        "sampling": {k: body.get(k) for k in ("max_tokens", "temperature", "tool_choice", "top_p")},
        "with_tools": {"tool_choice": with_tools.get("tool_choice")},
    }


def loop():
    """The numbers that decide how far a turn runs and how much of it survives."""
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


def strips_types():
    """Whether this node can import the shell's TypeScript directly, which needs 22.6 or later."""
    if shutil.which("node") is None:
        return False
    return subprocess.run(["node", "--experimental-strip-types", "-e", ""], capture_output=True).returncode == 0


def shell(root):
    """What the shell around the brain does between turns, asked of the shell itself.

    The follow-up message is built from the runs that settled, so there is no constant to
    publish: a harness standing in for the browser runs the same script with its own runs.
    """
    if root is None:
        return {}
    script = pathlib.Path(root) / SHELL_CONTRACT
    # An older node cannot read the shell's module at all, which is the same as having none.
    if not script.is_file() or not strips_types():
        return {}
    stated = subprocess.run(
        ["node", "--experimental-strip-types", str(script)],
        input="",
        capture_output=True,
        text=True,
    )
    if stated.returncode:
        raise SystemExit(f"the shell could not state its contract:\n{stated.stderr}")
    return {
        "max_auto_follow_ups": json.loads(stated.stdout)["max_auto_follow_ups"],
        "resume_prompt_from": SHELL_CONTRACT,
    }


def skills(root):
    """The vendored skills pin, plus a hash per file when the corpus has been built."""
    base = package_root() / "skills/galaxy-skills"
    files = (
        {str(f.relative_to(base)): hashlib.sha256(f.read_bytes()).hexdigest()[:16] for f in sorted(base.rglob("*.md"))}
        if base.is_dir()
        else {}
    )
    out = {"vendored": bool(files), "files": files}
    if root is not None:
        try:
            lock = json.loads((pathlib.Path(root) / "skills.lock.json").read_text())
        except OSError:
            return out
        out.update({"repo": lock["repo"], "ref": lock["ref"], "sha": lock["sha"]})
    return out


def describe(root=None):
    """The whole description. `root` is the package directory, for files outside the brain."""
    return {
        "schema": SCHEMA,
        "agent": "olit",
        "identity_prompt": identity_prompt(root),
        "symbols": symbols(),
        "prompt_blocks": prompt_blocks(),
        "tools": tools(),
        "policy": {"llm_request": llm_request(), "loop": loop(), "guards": guards()},
        "shell": shell(root),
        "skills": skills(root),
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", default=None, help="the olit package directory")
    args = ap.parse_args(argv)
    json.dump(describe(args.root), sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
