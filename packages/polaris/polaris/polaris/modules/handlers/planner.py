"""Handler for planner nodes.

Planners emit structured JSON output, never tool calls.
- Route planners: emit {"route": <enum>} for control flow
- JSON planners: emit parameter objects for downstream computation
"""

import json
import logging
from typing import TYPE_CHECKING, Any

from ..types import Context, NodeDefinition, Result
from .planner_shim import PlannerOutputShim, build_route_schema

if TYPE_CHECKING:
    from ..registry import Registry

logger = logging.getLogger(__name__)


class PlannerHandler:
    """Handler for planner nodes.

    Planners never emit tool calls. All output is validated JSON:
    - Route mode: {"route": <enum>} - used for control flow decisions
    - JSON mode: parameter object - used for downstream computation

    The shim validates the output. The runner handles route-to-node mapping.
    """

    def __init__(self) -> None:
        self.shim = PlannerOutputShim()

    async def execute(
        self,
        node: NodeDefinition,
        ctx: Context,
        registry: "Registry",
        runner: Any,
    ) -> Result:
        output_mode = node.get("output_mode")
        prompt = self._build_prompt(node, ctx, runner)

        # Build schema based on mode
        if output_mode == "route":
            schema = build_route_schema(node["routes"])
        else:
            schema = node["output_schema"]

        logger.debug(f"Planner executing in {output_mode} mode")

        # Request structured JSON from LLM (no tool calls)
        raw_response = await registry.reason_structured(prompt, schema)

        # Validate through shim (shim only validates, nothing else)
        result = self.shim.validate(raw_response, schema)

        if not result["ok"]:
            logger.warning(f"Planner validation failed: {result['error']}")
            return result

        # Set result in context
        ctx["result"] = result["result"]

        # Apply emit rules
        emit = node.get("emit")
        if emit:
            runner.resolver.apply_emit(emit, {"result": result["result"]}, ctx)

        logger.debug(f"Planner completed: {result['result']}")
        return result

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

        # Add context if available
        if resolved_input:
            prompt = f"""{prompt}

Context:
{json.dumps(resolved_input, indent=2)}"""

        return prompt
