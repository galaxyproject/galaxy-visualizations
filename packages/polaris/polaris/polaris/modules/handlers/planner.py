"""Handler for planner nodes."""

import logging
from typing import TYPE_CHECKING, Any

from ..types import Context, NodeDefinition, Result

if TYPE_CHECKING:
    from ..registry import Registry

logger = logging.getLogger(__name__)


class PlannerHandler:
    """Handler for planner nodes."""

    async def execute(
        self,
        node: NodeDefinition,
        ctx: Context,
        registry: "Registry",
        runner: Any,
    ) -> Result:
        tools = node.get("tools", [])
        logger.debug("Planner node starting with %d tools", len(tools))
        planned = await registry.plan(
            ctx,
            {
                "node": node,
                "prompt": node.get("prompt", ""),
                "tools": tools,
                "output_schema": node.get("output_schema"),
            },
        )
        logger.debug("Planner node completed")
        ctx["result"] = planned
        runner.resolver.apply_emit(node.get("emit"), {"result": planned}, ctx)
        return {"ok": True, "result": planned}
