"""Handler for control nodes."""

import logging
from typing import TYPE_CHECKING, Any

from ..types import Context, NodeDefinition, Result

if TYPE_CHECKING:
    from ..registry import Registry

logger = logging.getLogger(__name__)


class ControlHandler:
    """Handler for control nodes."""

    async def execute(
        self,
        node: NodeDefinition,
        ctx: Context,
        registry: "Registry",
        runner: Any,
    ) -> Result:
        decided = runner.resolver.eval_branch(node.get("condition"), ctx)
        logger.debug("Control branch decided: next=%s", decided.get("next"))
        ctx["result"] = decided
        return {"ok": True, "result": decided}
