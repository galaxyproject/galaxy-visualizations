"""Tool surface for the loop driver: named Galaxy tools, run_python, finish, processes."""

import json
import logging
from dataclasses import dataclass

from olit.registry import load_primitives
from olit.substrate import Confirmation, LocalExecutionError

from . import (
    artifacts,
    confusables,
    ena,
    fetch_failure_hint,
    galaxy_destructive,
    galaxy_tools,
    gtn,
    notebook,
    sra_import_gate,
)
from .brief import brief
from .outcome import ToolOutcome

logger = logging.getLogger(__name__)

# Start of a harmony control token, which no tool name and no result of ours contains.
HARMONY_MARKER = "<|"


def plain_tool_name(name):
    """`name` up to the first control token: the part that is actually the tool's name."""
    return (name or "").split(HARMONY_MARKER, 1)[0].strip() if isinstance(name, str) else name


def without_control_tokens(text):
    """`text` with any harmony control token dropped, so replaying it cannot re-parse.

    A name the model mangled comes back in our own error text and in the tool message's
    `name`, and the endpoint reads the marker as a message boundary on the next turn:
    one contaminated call left every later turn answering `Unknown role: final`.
    """
    if not isinstance(text, str) or HARMONY_MARKER not in text:
        return text
    return "".join(part.split("|>", 1)[-1] if i else part for i, part in enumerate(text.split(HARMONY_MARKER)))


RUN_PYTHON = {
    "type": "function",
    "function": {
        "name": "run_python",
        "description": (
            "Run Python locally in the browser (Pyodide). numpy and pandas are available; "
            "state persists across calls. Returns the last expression value and stdout. "
            "Top-level `await` works, and `pyfetch(url)` performs a browser fetch, so an "
            "HTTP API can be read directly - but only from hosts that send CORS headers, "
            "which many do not. This runs in the browser, NOT on Galaxy - it cannot import "
            "galaxy, and real compute belongs in a Galaxy job."
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


def _runnable(process, manifest):
    """Whether the session grants every capability the process declares."""
    return all(manifest.allows(c) for c in (process.capabilities or []))


_JSON_TYPES = {
    "string": "string",
    "array": "array",
    "object": "object",
    "integer": "integer",
    "number": "number",
    "boolean": "boolean",
}


def _process_tool_schemas(processes, manifest=None):
    """One tool per crystallized process, its schema read from the process's declared inputs.

    Only processes the manifest can actually run are advertised: a process runs on
    `Substrate.scoped(declared)`, so one declaring more than the session grants would fail
    on its first call. Measured: dispatched 0/3 when a process sat one level below the tool
    list, 3/3 once it had a name of its own.
    """
    schemas = []
    for name in processes.names():
        proc = processes.get(name)
        if manifest and not _runnable(proc, manifest):
            continue
        properties, required = {}, []
        for key, spec in proc.inputs.items():
            kind = _JSON_TYPES.get(spec.get("type", "string"), "string")
            properties[key] = {"type": "array", "items": {"type": "string"}} if kind == "array" else {"type": kind}
            described = [spec["help"]] if spec.get("help") else []
            if spec.get("default") is not None:
                described.append(f"Defaults to {spec['default']!r}.")
            if described:
                properties[key]["description"] = " ".join(described)
            if spec.get("required"):
                required.append(key)
        description = proc.description
        if proc.when_to_use:
            description = f"{description} Use {proc.when_to_use}."
        schemas.append(
            {
                "type": "function",
                "function": {
                    "name": name,
                    "description": description,
                    "parameters": {"type": "object", "properties": properties, "required": required},
                },
            }
        )
    return schemas


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


ARTIFACT_HINT = (
    "This artifact is already displayed to the user and is not a history dataset, "
    "so do not look for it there. Keeping it means writing {{artifact}} into a page "
    "where it belongs; that token is the only way to place it, since its content is "
    "held outside your context. Describe what it shows and finish."
)


class ToolSurface:
    def __init__(self, substrate, processes=None, skills=None, confirmation=None, prior=None):
        self.substrate = substrate
        self.processes = processes
        self.skills = skills
        # Unavailable by default, which makes the destructive gate refuse headlessly.
        self.confirmation = confirmation or Confirmation()
        # Renderable artifacts, routed to the shell so no large payload hits the LLM.
        self.artifacts = []
        # Earlier turns' artifacts, placeable in a page long after the turn that made them.
        self.prior = list(prior or [])
        # Fan-out intent for this turn; the surface is rebuilt per turn, as loom clears per turn.
        self.sra = sra_import_gate.SraImportGate()
        # The last call that failed and how often it has repeated, for the loop guard.
        self._last_failure = None
        # How often each settled lookup has been asked, by name and arguments.
        self._settled = {}
        self._schemas = None

    def schemas(self):
        """The advertised tools. Fixed for the session, and read on every dispatch."""
        if self._schemas is None:
            self._schemas = self._build_schemas()
        return self._schemas

    def _build_schemas(self):
        tools = [RUN_PYTHON]
        tools.extend(galaxy_tools.tool_schemas(self.substrate.manifest))
        tools.extend(notebook.tool_schemas(self.substrate.manifest))
        # Not manifest-gated: the hostname allowlist is the boundary, as in loom.
        tools.extend(gtn.tool_schemas())
        tools.extend(ena.tool_schemas())
        tools.append(FINISH)
        if self.skills and self.skills.names():
            tools.append(_skills_fetch_schema(self.skills))
        if self.processes and self.processes.names():
            tools.extend(_process_tool_schemas(self.processes, self.substrate.manifest))
        return tools

    def _declaration(self, name):
        """A tool's schema and the capabilities it needs, advertised to this session or not.

        Handlers are reachable by name whatever the manifest grants, so a tool kept out of
        the tool list still runs, and only the declaration says what it needed.
        """
        tool = galaxy_tools.declared(name)
        if tool:
            return tool["schema"], [tool["capability"]]
        if notebook.get_handler(name):
            return notebook.NOTEBOOK_RESUME, [notebook.CAPABILITY]
        if self.processes and name in (self.processes.names() or []):
            schema = next((s for s in _process_tool_schemas(self.processes) if s["function"]["name"] == name), None)
            return schema, list(self.processes.get(name).capabilities or [])
        return next((t for t in self.schemas() if t["function"]["name"] == name), None), []

    def _missing_required(self, schema, args):
        """Required parameters the call left out; presence only, not types."""
        if schema is None:
            return []  # unknown name: not ours to validate, and it may still fold
        required = schema["function"].get("parameters", {}).get("required") or []
        return [key for key in required if key not in args]

    def observe(self, tool_calls):
        """Take in a whole reply's calls, before any of them runs."""
        self.sra.observe(tool_calls)

    async def dispatch(self, name, args, call_id=None):
        """Run one tool call. Always a ToolOutcome — never a raised exception."""
        logger.info("tool %s(%s)", name, brief(args))
        repeated = self._repeating_a_failure(name, args)
        if repeated:
            logger.info("  -> breaking a loop of identical failing calls")
            self._last_failure = None  # a speed bump, not a ban
            return ToolOutcome(repeated, is_error=True, refused=True, guard="repeated-failure")
        settled = self._asking_a_settled_question(name, args)
        if settled:
            logger.info("  -> %s was already answered with these arguments", name)
            return ToolOutcome(settled, is_error=True, refused=True, guard="settled-question")
        fanned_out = self.sra.check(call_id, name, args)
        if fanned_out:
            logger.info("  -> blocking an SRA import that would fan out")
            return ToolOutcome(fanned_out, is_error=True, refused=True, guard="sra-fan-out")
        schema, capabilities = self._declaration(name)
        ungranted = next((c for c in capabilities if not self.substrate.manifest.allows(c)), None)
        if ungranted:
            logger.info("  -> %s needs the %s capability, which this session lacks", name, ungranted)
            # Counted, so an unchanged repeat meets the loop guard rather than running forever.
            self._note_outcome(name, args, True)
            return ToolOutcome(
                f"Refused: '{name}' needs the '{ungranted}' capability, which is not granted in "
                f"this session. Tell the user, and stay within the tools you are offered.",
                is_error=True,
                refused=True,
                guard="capability",
            )
        missing = self._missing_required(schema, args)
        if missing:
            logger.info("  -> missing required %s", missing)
            self._note_outcome(name, args, True)
            return ToolOutcome(
                f"Tool '{name}' was not called: missing required parameter(s): {', '.join(missing)}.",
                is_error=True,
            )
        try:
            result = await self._dispatch(name, args)
            outcome = result if isinstance(result, ToolOutcome) else ToolOutcome(result)
            self._note_outcome(name, args, outcome.is_error)
            logger.info("  -> %s", brief(outcome.content))
            return outcome
        except Exception as e:
            logger.warning("tool %s raised: %s", name, e)
            self._note_outcome(name, args, True)
            return ToolOutcome(f"Tool '{name}' raised: {e}", is_error=True)

    # Shorter than this is too weak a signal to read as a name.
    NAME_QUERY_MIN = 4

    def _olit_tool_named(self, args):
        """The Olit tool these arguments name, and whether they ask to run it or to find it."""
        names = (self.processes.names() or []) if self.processes else []
        if args.get("tool_id") in names:
            return args["tool_id"], True
        query = (args.get("query") or "").strip().lower()
        if len(query) < self.NAME_QUERY_MIN:
            return None, False
        return next((n for n in names if n == query or n.startswith(query)), None), False

    def _place_artifacts(self, args):
        """Swap every {{artifact}} token in the arguments for the markdown it names."""
        placed = dict(args)
        for key, value in args.items():
            text, refusal = artifacts.resolve(value, self.prior + self.artifacts)
            if refusal:
                return args, refusal
            placed[key] = text
        return placed, None

    def _claim_artifact(self, result, hint=None):
        """Route a renderable artifact to the shell, leaving a reference in the tool result."""
        if not isinstance(result, dict) or not isinstance(result.get("artifact"), dict):
            return result
        artifact = dict(result["artifact"])
        self.artifacts.append(artifact)
        payload = dict(result)
        payload["artifact"] = {"kind": artifact.get("kind"), "title": artifact.get("title")}
        if hint:
            payload["hint"] = hint
        return payload

    # An identical call that just failed will fail again; three is enough to establish it.
    FAILED_REPEAT_LIMIT = 3
    # A settled question keeps its answer, so a third asking is already two too many.
    SETTLED_REPEAT_LIMIT = 3

    def _asking_a_settled_question(self, name, args):
        """Why re-asking this is pointless, or None if the answer could still change."""
        if not galaxy_tools.settled(name):
            return None
        key = (name, brief(args))
        self._settled[key] = self._settled.get(key, 0) + 1
        if self._settled[key] < self.SETTLED_REPEAT_LIMIT:
            return None
        return (
            f"Refused: '{name}' was already answered {self._settled[key] - 1} times with these "
            f"exact arguments, and its answer is fixed for this session. Use the answer you "
            f"have, or take a different route."
        )

    # A call refused before dispatch, keyed so repeats count however the bytes differ.
    UNPARSABLE = {"arguments": "would not parse"}

    def repeating_unparsable(self, name):
        """Whether this tool's arguments have failed to parse often enough to stop trying."""
        if self._repeating_a_failure(name, self.UNPARSABLE) is None:
            return None
        self._last_failure = None  # a speed bump, not a ban
        return (
            f"Refused: the arguments for '{name}' have failed to parse "
            f"{self.FAILED_REPEAT_LIMIT} times in a row. The shape is the problem rather "
            f"than the content: send one JSON object containing only the parameters this "
            f"tool declares, and keep large text out of it."
        )

    def note_unparsable(self, name):
        """Count a refusal the loop made before dispatch, which the guard cannot otherwise see."""
        self._note_outcome(name, self.UNPARSABLE, True)

    def _repeating_a_failure(self, name, args):
        last = self._last_failure
        if not last or last["key"] != (name, brief(args)) or last["count"] < self.FAILED_REPEAT_LIMIT:
            return None
        return (
            f"Refused: '{name}' was already called with these exact arguments "
            f"{last['count']} times and failed each time. Change the arguments or the "
            f"approach; resending the same call cannot succeed."
        )

    def _note_outcome(self, name, args, is_error):
        key = (name, brief(args))
        last = self._last_failure
        if not is_error:
            self._last_failure = None
        elif last and last["key"] == key:
            last["count"] += 1
        else:
            self._last_failure = {"key": key, "count": 1}

    async def _dispatch(self, name, args):
        # First, so the confusables fold below cannot route around it.
        destructive = galaxy_destructive.classify(name, args)
        if destructive is not None:
            refusal = await self._gate_destructive(name, destructive)
            if refusal is not None:
                return ToolOutcome(refusal, is_error=True, refused=True, guard="destructive-declined")

        if name == "run_python":
            try:
                return await self.substrate.local.run(args.get("code", ""))
            except LocalExecutionError as exc:
                return ToolOutcome(str(exc), is_error=True)
        if self.processes and name in (self.processes.names() or []):
            return await self._run_process({"name": name, "inputs": args})
        # An Olit process is not a Galaxy tool; Galaxy answers "Tool not found" or nothing at
        # all. A tool_id asks for one directly and a query hunts the catalog for it by name.
        wanted, running_it = self._olit_tool_named(args)
        if wanted and running_it:
            return ToolOutcome(f"'{wanted}' is an Olit tool, not a Galaxy tool. Call {wanted} directly.", is_error=True)
        if wanted:
            # A search is the model orienting itself; say where the tool lives and leave the
            # choice of route to the request, which may have named a different one.
            return ToolOutcome(
                f"'{wanted}' is an Olit tool rather than a Galaxy tool, so the tool catalog "
                f"does not hold it. It is already in your tool list if you need it.",
                is_error=True,
            )
        if name == "skills_fetch":
            return self._skills_fetch(args)
        if name == "finish":
            return args.get("summary", "done")
        handler = galaxy_tools.get_handler(name) or notebook.get_handler(name)
        if handler:
            args, refusal = self._place_artifacts(args)
            if refusal:
                return ToolOutcome(f"Refused: {refusal}", is_error=True)
            result = self._claim_artifact(await handler(self.substrate.galaxy, args))
            payload = json.dumps(result, default=str)
            # Galaxy names the url and the status; it cannot say that guessing another is wrong.
            hint = fetch_failure_hint.for_result(result)
            return f"{payload}\n\n{hint}" if hint else payload
        reference_handler = gtn.get_handler(name) or ena.get_handler(name)
        if reference_handler:
            return json.dumps(await reference_handler(args), default=str)
        # Last resort: the name may be spelled with Cyrillic/Greek lookalikes.
        folded = self._fold_tool_name(name)
        if folded:
            logger.info("tool name %r resolved to %r", name, folded)
            return await self._dispatch(folded, args)
        return ToolOutcome(f"Unknown tool: {plain_tool_name(name)}", is_error=True)

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
        advertised = [t["function"]["name"] for t in self.schemas()]
        # gpt-oss speaks harmony; an endpoint that leaves its control tokens in place welds
        # the channel marker to the name, and `get_page<|channel|>commentary` matches nothing.
        trimmed = plain_tool_name(name)
        if trimmed != name and trimmed in advertised:
            return trimmed
        if not confusables.has_confusables(name or ""):
            return None
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
                f'Error: Skills repo "{repo_name}" is not configured. ' f"Available: {', '.join(self.skills.names())}.",
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
        load_primitives()

        # Least privilege: the process manifest, intersected with the session's.
        substrate = self.substrate.scoped(proc.capabilities)
        result = await proc.run(substrate, args.get("inputs") or {})
        last = result.get("last") or {}
        summary = proc.summarize(result.get("state") or {}) if proc.summarize else None
        # A Python process always reports last.ok, so refusing is something only its summary
        # can say. Without this a refusal read as a successful result.
        if isinstance(summary, dict) and summary.get("ok") is False:
            return ToolOutcome(json.dumps(summary), is_error=True, refused=True, guard="process-refusal")
        if summary and last.get("ok") is not False:
            return json.dumps(summary)
        # Surface a failed graph rather than returning a bare null.
        if last.get("ok") is False:
            return ToolOutcome(json.dumps({"ok": False, "error": last.get("error")}), is_error=True)
        output = last.get("result")
        # A renderable artifact goes to the shell out of band, not into the context.
        claimed = self._claim_artifact(output, hint=ARTIFACT_HINT)
        if claimed is not output:
            return json.dumps({**claimed, "ok": True}, default=str)
        return json.dumps(output)
