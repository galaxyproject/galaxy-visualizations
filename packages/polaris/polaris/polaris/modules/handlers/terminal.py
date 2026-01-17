"""Handler for terminal nodes."""

import logging
from typing import TYPE_CHECKING, Any

from ..types import Context, NodeDefinition, Result

if TYPE_CHECKING:
    from ..registry import Registry

logger = logging.getLogger(__name__)


class TerminalHandler:
    """Handler for terminal nodes."""

    async def execute(
        self,
        node: NodeDefinition,
        ctx: Context,
        registry: "Registry",
        runner: Any,
    ) -> Result:
        logger.debug("Terminal node reached, resolving output")
        if node.get("output") is not None:
            runner.state["output"] = runner.resolver.resolve(node.get("output"), ctx)
        logger.info("Graph execution terminated")
        return {"ok": True, "result": runner.state.get("output")}
