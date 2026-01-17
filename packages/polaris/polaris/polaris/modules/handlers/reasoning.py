"""Handler for reasoning nodes."""

import logging
from typing import TYPE_CHECKING, Any

from ..types import Context, NodeDefinition, Result

if TYPE_CHECKING:
    from ..registry import Registry

logger = logging.getLogger(__name__)


class ReasoningHandler:
    """Handler for reasoning nodes."""

    async def execute(
        self,
        node: NodeDefinition,
        ctx: Context,
        registry: "Registry",
        runner: Any,
    ) -> Result:
        resolved_input = runner.resolver.resolve(node.get("input", {}), ctx)
        try:
            result = await registry.reason(
                prompt=node.get("prompt", ""),
                input=resolved_input,
            )
            ctx["result"] = result
            runner.resolver.apply_emit(node.get("emit"), {"result": result}, ctx)
            return {"ok": True, "result": result}
        except Exception as e:
            logger.error(f"Reasoning node failed: {e}")
            return {
                "ok": False,
                "error": {
                    "code": "reasoning_failed",
                    "message": str(e),
                    "node_id": ctx.get("nodeId"),
                },
            }
