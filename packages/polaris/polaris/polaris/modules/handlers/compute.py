"""Handler for compute nodes."""

import logging
from typing import TYPE_CHECKING, Any

from ..types import Context, NodeDefinition, Result

if TYPE_CHECKING:
    from ..registry import Registry

logger = logging.getLogger(__name__)


class ComputeHandler:
    """Handler for compute nodes."""

    async def execute(
        self,
        node: NodeDefinition,
        ctx: Context,
        registry: "Registry",
        runner: Any,
    ) -> Result:
        logger.debug("Compute node executing emit rules")
        ctx["result"] = None
        runner.resolver.apply_emit(node.get("emit"), {"result": None}, ctx)
        return {"ok": True, "result": None}
