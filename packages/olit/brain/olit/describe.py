"""The surface olit exposes, as data.

Everything an outside evaluator needs to judge olit without reading its source: the tools
the model is shown, the Galaxy queries they build, the guards that can refuse a call, the
sampling and loop policy, the prompt symbols, and the vendored skills pin.

    python3 -m olit.describe --root ..
"""

import argparse
import ast
import hashlib
import inspect
import json
import pathlib
import re
import sys

from olit import compaction, prompt
from olit.drivers.loop import agent, galaxy_tools, paging

SCHEMA = 1

# Where the system prompt is composed; its blocks are named separately.
PROMPT_MODULE = "prompt.py"

# Excluded from the symbol table: contracts owned elsewhere, and the vendored corpus.
SKIPPED = ("vendor/", "registry/skills/")

# Modules that name the guards able to refuse a call.
GUARD_MODULES = ("drivers/loop/tools.py", "drivers/loop/agent.py")

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


def py_symbol(text, symbol):
    """A module-level constant (triple-quoted, braced or parenthesised), or a `def` body."""
    m = re.search(rf'^{re.escape(symbol)} = ("""|\'\'\')', text, re.M)
    if m:
        quote = m.group(1)
        end = text.index(quote, m.end())
        return text[m.start() : end + len(quote)]
    for opener, closer in (("{", "}"), ("(", ")")):
        m = re.search(rf"^{re.escape(symbol)} = \{opener}$", text, re.M)
        if not m:
            continue
        lines = text[m.start() :].splitlines()
        body = [lines[0]]
        for line in lines[1:]:
            body.append(line)
            if line == closer:
                break
        return "\n".join(body)
    m = re.search(rf"^def {re.escape(symbol)}\b", text, re.M)
    if not m:
        return None
    rest = text[m.start() :].splitlines()
    out = [rest[0]]
    for line in rest[1:]:
        if line and not line[0].isspace():
            break
        out.append(line)
    return "\n".join(out).rstrip()


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


def _passthrough_handlers():
    """Handlers whose whole body is one `return await g.<verb>(...)`."""
    tree = ast.parse((package_root() / "drivers/loop/galaxy_tools.py").read_text())
    out = set()
    for node in ast.walk(tree):
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
    source = ast.parse((package_root() / "drivers/loop/galaxy_tools.py").read_text())
    by_name = {
        node.name: node for node in ast.walk(source) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
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


def guards():
    """Every guard that can refuse a call, read from the code that names them."""
    found = set()
    base = package_root()
    for rel in GUARD_MODULES:
        tree = ast.parse((base / rel).read_text())
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
    """What an unconfigured request carries, so a new unconditional field shows up."""
    from olit.substrate.llm import get_adapter
    from olit.substrate.llm.providers import Model, Provider, Target

    bare = Target(Provider(id="p", base_url="http://x"), Model("m"), "http://x", None, 128000, None, 30)
    body = get_adapter("openai-completions").build_request(bare, [], None)
    return {
        "body_keys": sorted(k for k in body if k != "messages"),
        "sampling": {k: body.get(k) for k in ("max_tokens", "temperature", "tool_choice", "top_p")},
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


def shell(root):
    """What the shell around the brain does between turns, for a harness that stands in for it."""
    if root is None:
        return {}
    try:
        source = (pathlib.Path(root) / "src/auto-resume.ts").read_text()
    except OSError:
        return {}
    found = re.search(r"DEFAULT_MAX_AUTO_FOLLOW_UPS = (\d+)", source)
    body = source.split("export function buildResumePrompt", 1)[-1].split("return (", 1)[-1]
    parts = re.findall(r'"((?:[^"\\]|\\.)*)"', body.split("\n    );", 1)[0])
    return {
        "max_auto_follow_ups": int(found.group(1)) if found else None,
        "resume_prompt": "".join(p.encode().decode("unicode_escape") for p in parts) or None,
    }


def skills(root):
    """The vendored skills pin, plus a hash per file when the corpus has been built."""
    base = package_root() / "registry/skills/galaxy-skills"
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
