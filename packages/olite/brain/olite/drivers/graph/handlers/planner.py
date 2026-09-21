"""Handler for planner nodes: structured JSON output, never tool calls."""

import json
import logging
from typing import TYPE_CHECKING, Any

import jsonschema

from olite.substrate.llm.json_parse import loads_with_repair

from ..builders import get_builder, is_build_spec
from ..constants import PLANNER_MAX_ATTEMPTS, ErrorCode
from ..types import Context, NodeDefinition, Result

if TYPE_CHECKING:
    from ..registry import Registry

logger = logging.getLogger(__name__)


def build_route_schema(routes: dict[str, Any]) -> dict[str, Any]:
    """JSON schema validating {"route": <enum>}."""
    return {
        "type": "object",
        "required": ["route"],
        "properties": {"route": {"enum": list(routes.keys())}},
        "additionalProperties": False,
    }


def validate_output(raw_response: str, schema: dict[str, Any]) -> Result:
    """Parse the planner's JSON and validate it against the schema."""
    try:
        data = loads_with_repair(raw_response)
    except json.JSONDecodeError as e:
        logger.error("Failed to parse planner JSON output: %s", e)
        return {
            "ok": False,
            "error": {
                "code": ErrorCode.PLANNER_INVALID_JSON,
                "message": f"Failed to parse JSON: {e.msg}",
                "details": {"position": e.pos, "raw_truncated": raw_response[:200]},
            },
        }
    try:
        jsonschema.validate(data, schema)
    except jsonschema.ValidationError as e:
        logger.error("Planner output failed schema validation: %s", e.message)
        return {
            "ok": False,
            "error": {
                "code": ErrorCode.PLANNER_SCHEMA_VALIDATION_FAILED,
                "message": f"Schema validation failed: {e.message}",
                "details": {"path": list(e.path), "schema_path": list(e.schema_path), "value": e.instance},
            },
        }
    return {"ok": True, "result": data}


class PlannerHandler:
    """Handler for planner nodes: validated JSON only, route or parameter object."""

    async def execute(
        self,
        node: NodeDefinition,
        ctx: Context,
        registry: "Registry",
        runner: Any,
    ) -> Result:
        output_mode = node.get("output_mode")
        prompt = self._build_prompt(node, ctx, runner)

        # In json mode the schema may be state-derived via {$build: name, args}.
        if output_mode == "route":
            schema = build_route_schema(node["routes"])
        else:
            try:
                schema = self._resolve_schema(node["output_schema"], ctx, runner)
            except Exception as e:
                # A builder refusing to produce a contract is the real failure; report it here.
                logger.error("Planner schema build failed: %s", e)
                return {
                    "ok": False,
                    "error": {
                        "code": ErrorCode.PLANNER_SCHEMA_BUILD_FAILED,
                        "message": str(e),
                        "details": {"node": ctx.get("nodeId")},
                    },
                }

        logger.debug("Planner executing in %s mode", output_mode)

        # The schema is advisory prompt text, so a repairable miss retries rather than aborts.
        result: Result = {"ok": False, "error": {"code": ErrorCode.PLANNER_INVALID_JSON, "message": "no attempt made"}}
        attempt_prompt = prompt
        for attempt in range(1, PLANNER_MAX_ATTEMPTS + 1):
            raw_response = await registry.reason_structured(attempt_prompt, schema)

            result = validate_output(raw_response, schema)
            if result["ok"]:
                break

            error = result["error"]
            logger.warning("Planner validation failed (attempt %s/%s): %s", attempt, PLANNER_MAX_ATTEMPTS, error['message'])
            if attempt < PLANNER_MAX_ATTEMPTS:
                attempt_prompt = self._repair_prompt(prompt, raw_response, error)

        if not result["ok"]:
            result["error"]["details"] = {
                **(result["error"].get("details") or {}),
                "attempts": PLANNER_MAX_ATTEMPTS,
            }
            return result

        # Set result in context
        ctx["result"] = result["result"]

        # Apply emit rules
        emit = node.get("emit")
        if emit:
            runner.resolver.apply_emit(emit, {"result": result["result"]}, ctx)

        logger.debug("Planner completed: %s", result['result'])
        return result

    def _repair_prompt(
        self,
        prompt: str,
        raw_response: str,
        error: dict[str, Any],
    ) -> str:
        """Re-ask the planner, quoting its rejected reply and why it was rejected."""
        where = ".".join(str(p) for p in (error.get("details") or {}).get("path") or [])
        location = f" at `{where}`" if where else ""
        return f"""{prompt}

Your previous reply was rejected{location}:
{raw_response[:500]}

Reason: {error.get("message")}

Correct the problem and reply again. Every value must come from the schema's
allowed options — do not invent field names or values outside an enum."""

    def _resolve_schema(
        self,
        spec: Any,
        ctx: Context,
        runner: Any,
    ) -> dict[str, Any]:
        """Resolve a json-mode output schema; `{$build: name, args}` resolves against state."""
        if is_build_spec(spec):
            builder = get_builder(spec["$build"])
            args = runner.resolver.resolve(spec.get("args", {}), ctx) or {}
            return builder(**args)
        return spec

    def _build_prompt(
        self,
        node: NodeDefinition,
        ctx: Context,
        runner: Any,
    ) -> str:
        """Build prompt with context and output instructions."""
        base_prompt = node.get("prompt", "")
        output_mode = node.get("output_mode")

        # Resolve input if specified
        input_spec = node.get("input")
        if input_spec:
            resolved_input = runner.resolver.resolve(input_spec, ctx)
        else:
            resolved_input = None

        if output_mode == "route":
            routes = node["routes"]
            options = "\n".join(
                f'- "{name}": {spec["description"]}'
                for name, spec in routes.items()
            )
            prompt = f"""{base_prompt}

Select exactly one route from the following options:
{options}

Respond with valid JSON in this exact format: {{"route": "<selected_route>"}}
Do not include any other text, explanation, or formatting."""

        else:
            # JSON mode
            prompt = f"""{base_prompt}

Respond with valid JSON matching the required schema.
Do not include any other text, explanation, or formatting."""

        if resolved_input:
            prompt = f"""{prompt}

Context:
{json.dumps(resolved_input, indent=2)}"""

        return prompt
