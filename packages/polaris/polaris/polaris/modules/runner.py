"""Graph runner for agent execution."""

import logging
from typing import TYPE_CHECKING, Any

from .constants import MAX_NODES, ErrorCode, NodeType
from .handlers import get_handler
from .resolver import Resolver
from .types import Context, GraphDefinition, NodeDefinition, ProgressCallback, Result

if TYPE_CHECKING:
    from .registry import Registry

logger = logging.getLogger(__name__)


class Runner:
    """Executes agent graphs by traversing nodes and delegating to handlers."""

    def __init__(
        self,
        graph: GraphDefinition,
        registry: "Registry",
        on_progress: ProgressCallback | None = None,
    ) -> None:
        self.graph = graph
        self.registry = registry
        self.state: dict[str, Any] = {}
        self.on_progress = on_progress
        self.resolver = Resolver(self.state)

    def emit_progress(self, node_id: str, status: str, node_type: str = "", detail: str = "") -> None:
        """Emit progress event if callback is registered."""
        if self.on_progress:
            self.on_progress({
                "node_id": node_id,
                "node_type": node_type,
                "status": status,
                "detail": detail,
            })

    async def run(self, inputs: dict[str, Any]) -> dict[str, Any]:
        """Execute the agent graph.

        Args:
            inputs: Input values for the graph execution.

        Returns:
            Dict containing final state and last node output.
        """
        graph_id = self.graph.get("id", "unknown")
        logger.info("Starting graph execution: %s", graph_id)
        logger.debug("Graph inputs: %s", inputs)

        self.state["inputs"] = inputs
        node_id = self.graph.get("start")
        safety = 0
        output: Result | None = None

        if node_id:
            while node_id and safety < MAX_NODES:
                safety += 1
                if node_id in self.graph.get("nodes", {}):
                    node = self.graph["nodes"][node_id]
                    node_type = node.get("type", "")
                    logger.debug("Executing node: %s (type: %s)", node_id, node_type)
                    self.emit_progress(node_id, "started", node_type)
                    res, ctx = await self.run_node(node_id, node)
                    status = "completed" if res.get("ok", True) else "failed"
                    if res.get("ok"):
                        logger.debug("Node %s completed successfully", node_id)
                    else:
                        logger.warning("Node %s failed: %s", node_id, res.get("error"))
                    self.emit_progress(node_id, status, node_type)
                    node_id = self._resolve_next(node, res, ctx)
                    output = res
                else:
                    logger.error("Unknown node referenced: %s", node_id)
                    output = {"ok": False, "error": {"code": ErrorCode.UNKNOWN_NODE, "message": str(node_id)}}
                    node_id = None
        else:
            logger.error("Graph has no start node")
            output = {"ok": False, "error": {"code": ErrorCode.MISSING_START, "message": "Graph has no start node"}}

        logger.info("Graph execution completed: %s (nodes executed: %d)", graph_id, safety)
        return {"state": self.state, "last": output}

    async def run_node(self, node_id: str, node: NodeDefinition) -> tuple[Result, Context]:
        """Execute a single node.

        Args:
            node_id: The node identifier.
            node: The node definition.

        Returns:
            Tuple of (result, context).
        """
        ctx: Context = {
            "inputs": self.state.get("inputs"),
            "state": self.state,
            "nodeId": node_id,
            "graphId": self.graph.get("id"),
            "graph": self.graph,
        }

        node_type = node.get("type", "")
        handler = get_handler(node_type)

        if handler:
            res = await handler.execute(node, ctx, self.registry, self)
        else:
            res = {"ok": False, "error": {"code": ErrorCode.UNKNOWN_NODE_TYPE, "message": str(node_type)}}

        return res, ctx

    def _resolve_next(self, node: NodeDefinition, res: Result | None, ctx: Context) -> str | None:
        """Determine the next node to execute.

        Args:
            node: The current node definition.
            res: The result from node execution.
            ctx: The execution context.

        Returns:
            The next node ID or None to stop execution.
        """
        next_val = None
        on_handlers = node.get("on", {})

        if res and res.get("ok") is False:
            # Error case - use on.error handler if defined
            if on_handlers.get("error"):
                next_val = on_handlers["error"]
            else:
                next_val = None
        elif res and res.get("warnings") and on_handlers.get("warning"):
            # Partial success with warnings - use on.warning handler if defined
            next_val = on_handlers["warning"]
        else:
            # Success case
            node_type = node.get("type")

            if node_type == NodeType.CONTROL:
                # Control nodes return next in result
                next_val = res.get("result", {}).get("next") if res else None

            elif node_type == NodeType.PLANNER and node.get("output_mode") == "route":
                # Route planners: map enum value to next node
                if res and res.get("ok") and res.get("result"):
                    route_value = res["result"].get("route")
                    routes = node.get("routes", {})
                    if route_value and route_value in routes:
                        next_val = routes[route_value].get("next")
                    else:
                        logger.warning(f"Invalid route value: {route_value}")
                        next_val = None

            else:
                # All other nodes: use static 'next'
                nv = node.get("next")
                if isinstance(nv, dict):
                    ctx["result"] = res.get("result") if res else None
                    next_val = self.resolver.resolve(nv, ctx)
                elif isinstance(nv, str):
                    next_val = nv
                elif on_handlers.get("ok"):
                    next_val = on_handlers["ok"]
                else:
                    next_val = None

        return str(next_val) if next_val is not None else None
