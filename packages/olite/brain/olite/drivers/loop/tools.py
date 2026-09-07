"""Tool surface for the loop driver: named Galaxy tools, run_python, finish, processes."""

import json
import logging
from dataclasses import dataclass

from olite.substrate import Confirmation

from . import confusables, galaxy_collections, galaxy_destructive, galaxy_tools, gtn, notebook
from .brief import brief

logger = logging.getLogger(__name__)

galaxy_collections.register()




RUN_PYTHON = {
    "type": "function",
    "function": {
        "name": "run_python",
        "description": (
            "Run Python locally in the browser (Pyodide). numpy and pandas are available; "
            "state persists across calls. Returns the last expression value and stdout. "
            "This runs in the browser, NOT on Galaxy - it cannot import galaxy."
        ),
        "parameters": {
            "type": "object",
            "properties": {"code": {"type": "string"}},
            "required": ["code"],
        },
    },
}

FINISH = {
    "type": "function",
    "function": {
        "name": "finish",
        "description": "Call when the task is complete, with a short summary.",
        "parameters": {
            "type": "object",
            "properties": {"summary": {"type": "string"}},
            "required": ["summary"],
        },
    },
}


def _skills_fetch_schema(skills):
    """Orbit's `skills_fetch`: addressed by repo-relative path, not by name."""
    return {
        "type": "function",
        "function": {
            "name": "skills_fetch",
            "description": (
                "Fetch operational know-how from a skills repo. The system prompt's "
                '"Skills repositories" section lists the available repos and the '
                "canonical paths inside each. If `repo` is omitted, the first repo is used."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "repo": {
                        "type": "string",
                        "enum": skills.names(),
                        "description": "Name of the skills repo. Omit to use the default (first) repo.",
                    },
                    "path": {
                        "type": "string",
                        "description": (
                            "Relative path inside the repo, e.g. "
                            "'collection-manipulation/SKILL.md', "
                            "'galaxy-integration/mcp-reference/gotchas.md'."
                        ),
                    },
                },
                "required": ["path"],
            },
        },
    }


def _run_process_schema(processes):
    return {
        "type": "function",
        "function": {
            "name": "run_process",
            "description": (
                "Run a crystallized process: a validated, multi-step pipeline. "
                "Prefer these over improvising when one fits.\nAvailable:\n" + processes.catalog_text()
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "enum": processes.names()},
                    "inputs": {"type": "object", "description": "Process inputs."},
                },
                "required": ["name", "inputs"],
            },
        },
    }


@dataclass
class ToolOutcome:
    """What a tool call produced, and whether it counts as a failure."""

    content: object
    is_error: bool = False

    @property
    def text(self):
        return self.content if isinstance(self.content, str) else json.dumps(self.content)


class ToolSurface:
    def __init__(self, substrate, processes=None, skills=None, confirmation=None):
        self.substrate = substrate
        self.processes = processes
        self.skills = skills
        # Unavailable by default, which makes the destructive gate refuse headlessly.
        self.confirmation = confirmation or Confirmation()
        # Renderable artifacts, routed to the shell so no large payload hits the LLM.
        self.artifacts = []

    def schemas(self):
        tools = [RUN_PYTHON]
        tools.extend(galaxy_tools.tool_schemas(self.substrate.manifest))
        tools.extend(notebook.tool_schemas(self.substrate.manifest))
        # Not manifest-gated: the hostname allowlist is the boundary, as in loom.
        tools.extend(gtn.tool_schemas())
        tools.append(FINISH)
        if self.skills and self.skills.names():
            tools.append(_skills_fetch_schema(self.skills))
        if self.processes and self.processes.names():
            tools.append(_run_process_schema(self.processes))
        return tools

    def _missing_required(self, name, args):
        """Required parameters the call left out; presence only, not types."""
        schema = next((t for t in self.schemas() if t["function"]["name"] == name), None)
        if schema is None:
            return []  # unknown name: not ours to validate, and it may still fold
        required = schema["function"].get("parameters", {}).get("required") or []
        return [key for key in required if key not in args]

    async def dispatch(self, name, args):
        """Run one tool call. Always a ToolOutcome — never a raised exception."""
        logger.info("tool %s(%s)", name, brief(args))
        missing = self._missing_required(name, args)
        if missing:
            logger.info("  -> missing required %s", missing)
            return ToolOutcome(
                f"Tool '{name}' was not called: missing required parameter(s): {', '.join(missing)}.",
                is_error=True,
            )
        try:
            result = await self._dispatch(name, args)
            outcome = result if isinstance(result, ToolOutcome) else ToolOutcome(result)
            logger.info("  -> %s", brief(outcome.content))
            return outcome
        except Exception as e:
            logger.warning("tool %s raised: %s", name, e)
            return ToolOutcome(f"Tool '{name}' raised: {e}", is_error=True)

    async def _dispatch(self, name, args):
        # First, so the confusables fold below cannot route around it.
        destructive = galaxy_destructive.classify(name, args)
        if destructive is not None:
            refusal = await self._gate_destructive(name, destructive)
            if refusal is not None:
                return ToolOutcome(refusal, is_error=True)

        if name == "run_python":
            return self.substrate.local.run(args.get("code", ""))
        if name == "run_process":
            return await self._run_process(args)
        if name == "skills_fetch":
            return self._skills_fetch(args)
        if name == "finish":
            return args.get("summary", "done")
        handler = galaxy_tools.get_handler(name) or notebook.get_handler(name)
        if handler:
            return json.dumps(await handler(self.substrate.galaxy, args), default=str)
        gtn_handler = gtn.get_handler(name)
        if gtn_handler:
            return json.dumps(await gtn_handler(args), default=str)
        # Last resort: the name may be spelled with Cyrillic/Greek lookalikes.
        folded = self._fold_tool_name(name)
        if folded:
            logger.info("tool name %r folded to %r (unicode confusables)", name, folded)
            return await self._dispatch(folded, args)
        return ToolOutcome(f"Unknown tool: {name}", is_error=True)

    async def _gate_destructive(self, name, op):
        """Why this must not run, or None if the user approved; never cached."""
        headline = galaxy_destructive.describe(op)
        if not self.confirmation.available:
            logger.warning("refused destructive op %s: no way to ask", name)
            return (
                f"Refused: {headline} There is no interactive session to approve it. "
                "Tell the user what you wanted to do and let them do it in the Galaxy interface."
            )
        if not await self.confirmation.ask("Confirm destructive operation", headline):
            logger.info("user declined destructive op %s", name)
            return f"Refused: {headline} The user declined."
        logger.warning("user approved destructive op %s: %s", name, op["kind"])
        return None

    def _fold_tool_name(self, name):
        """The advertised tool `name` meant, or None; folds only what is advertised."""
        if not confusables.has_confusables(name or ""):
            return None
        advertised = [t["function"]["name"] for t in self.schemas()]
        return confusables.find_match(name, advertised)

    def _skills_fetch(self, args):
        """Second half of progressive disclosure: one file, whole and untruncated."""
        path = args.get("path")
        repo_name = args.get("repo")
        if not self.skills:
            return ToolOutcome("Error: No skills repos are available.", is_error=True)
        repo = self.skills.find(repo_name)
        if repo is None:
            return ToolOutcome(
                f"Error: Skills repo \"{repo_name}\" is not configured. "
                f"Available: {', '.join(self.skills.names())}.",
                is_error=True,
            )
        text = repo.read(path)
        if text is None:
            return ToolOutcome(
                f'Error: Failed to fetch "{path}" from {repo.name}. '
                "Check the path against the skills router in the system prompt.",
                is_error=True,
            )
        return text

    async def _run_process(self, args):
        proc = self.processes.get(args.get("name")) if self.processes else None
        if not proc:
            return ToolOutcome(json.dumps({"error": f"unknown process: {args.get('name')}"}), is_error=True)
        from olite.drivers.graph import GraphDriver
        from olite.registry import load_primitives

        load_primitives()

        # Least privilege: the process manifest, intersected with the session's.
        substrate = self.substrate.scoped(proc.capabilities)
        result = await GraphDriver(substrate).run(proc.graph, args.get("inputs") or {})
        last = result.get("last") or {}
        # Surface a failed graph rather than returning a bare null.
        if last.get("ok") is False:
            return ToolOutcome(json.dumps({"ok": False, "error": last.get("error")}), is_error=True)
        output = last.get("result")
        # A renderable artifact goes to the shell out of band, not into the context.
        if isinstance(output, dict) and isinstance(output.get("artifact"), dict):
            art = dict(output["artifact"])
            self.artifacts.append(art)
            payload = {k: v for k, v in output.items() if k != "artifact"}
            payload["ok"] = True
            payload["artifact"] = {"kind": art.get("kind"), "title": art.get("title")}
            return json.dumps(payload, default=str)
        return json.dumps(output)
