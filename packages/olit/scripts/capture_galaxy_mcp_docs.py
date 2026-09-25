"""Refresh the galaxy-mcp tool set the parity test compares against.

Run against an installed galaxy-mcp -- `uvx --from galaxy-mcp python3 ...` or a venv that
has it. The brain does not depend on galaxy-mcp, so this is a deliberate, occasional step
rather than something the build does.

Captures every tool the server registers, not only the ones olit already serves: a tool
added upstream is invisible to a snapshot filtered by what we have, which is how
recommend_biocontainer went unnoticed until an eval scenario flipped.
"""

import ast
import json
import pathlib
import sys
import textwrap

HERE = pathlib.Path(__file__).resolve().parents[1]
OUT = HERE / "brain" / "tests" / "data" / "galaxy-mcp-docs.json"


def registered(tree):
    """Names the server exposes as MCP tools, decorated or registered behind a condition."""
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for decorator in node.decorator_list:
                base = decorator.func if isinstance(decorator, ast.Call) else decorator
                if ast.unparse(base) == "mcp.tool":
                    names.add(node.name)
        # `mcp.tool(...)(fn)`: registration away from the def, for a tool gated on an extra.
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Call):
            if ast.unparse(node.func.func) == "mcp.tool" and node.args:
                target = node.args[0]
                if isinstance(target, ast.Name):
                    names.add(target.id)
    return names


def parameters(node):
    """The argument names the tool exposes, in order, excluding the MCP context."""
    args = node.args
    names = [a.arg for a in (*args.posonlyargs, *args.args, *args.kwonlyargs)]
    return [n for n in names if n not in ("self", "ctx", "context")]


def main(argv):
    if not argv:
        sys.exit("usage: capture_galaxy_mcp_docs.py <path to galaxy_mcp/server.py> [version]")
    source = pathlib.Path(argv[0])
    version = argv[1] if len(argv) > 1 else json.loads(OUT.read_text())["version"]
    tree = ast.parse(source.read_text())
    wanted = registered(tree)
    defs = [
        node
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in wanted and ast.get_docstring(node)
    ]
    docs = {node.name: textwrap.dedent(ast.get_docstring(node)).strip() for node in defs}
    params = {node.name: parameters(node) for node in defs}
    missing = sorted(wanted - set(docs))
    if missing:
        sys.exit(f"registered without a docstring, so nothing to compare: {missing}")
    payload = {"version": version, "docs": docs, "params": params}
    OUT.write_text(json.dumps(payload, indent=1, sort_keys=True) + "\n")
    print(f"{OUT.relative_to(HERE)}: {len(docs)} tools from galaxy-mcp {version}")


if __name__ == "__main__":
    main(sys.argv[1:])
