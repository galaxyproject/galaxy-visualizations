"""Refresh the galaxy-mcp docstrings the parity test compares against.

Run against an installed galaxy-mcp -- `uvx --from galaxy-mcp python3 ...` or a venv that
has it. The brain does not depend on galaxy-mcp, so this is a deliberate, occasional step
rather than something the build does.
"""

import ast
import json
import pathlib
import sys
import textwrap

HERE = pathlib.Path(__file__).resolve().parents[1]
OUT = HERE / "brain" / "tests" / "data" / "galaxy-mcp-docs.json"


def main(argv):
    if not argv:
        sys.exit("usage: capture_galaxy_mcp_docs.py <path to galaxy_mcp/server.py> [version]")
    source = pathlib.Path(argv[0])
    version = argv[1] if len(argv) > 1 else json.loads(OUT.read_text())["version"]
    tree = ast.parse(source.read_text())
    docs = {
        n.name: textwrap.dedent(ast.get_docstring(n)).strip()
        for n in ast.walk(tree)
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and ast.get_docstring(n)
    }
    sys.path.insert(0, str(HERE / "brain"))
    from olit.drivers.loop.galaxy_tool_docs import DOCS

    keep = {k: v for k, v in sorted(docs.items()) if k in DOCS}
    OUT.write_text(json.dumps({"version": version, "docs": keep}, indent=1) + "\n")
    print(f"{OUT.relative_to(HERE)}: {len(keep)} descriptions from galaxy-mcp {version}")


if __name__ == "__main__":
    main(sys.argv[1:])
