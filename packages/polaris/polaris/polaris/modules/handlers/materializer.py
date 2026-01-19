"""Handler for materializer nodes.

A materializer node invokes a pure Python function with explicit arguments.
It is deterministic, has no LLM calls, no branching on content, and no
side effects outside the optional workspace path.
"""

import logging
import traceback
from typing import TYPE_CHECKING, Any

import jsonschema

from ..constants import ErrorCode
from ..materializers import catalog
from ..types import Context, NodeDefinition, Result

if TYPE_CHECKING:
    from ..registry import Registry

logger = logging.getLogger(__name__)


class MaterializerHandler:
    """Handler for materializer nodes.

    Executes a pre-registered Python function with resolved arguments.
    The function must be registered in the materializer catalog before
    the runtime is initialized.
    """

    async def execute(
        self,
        node: NodeDefinition,
        ctx: Context,
        registry: "Registry",
        runner: Any,
    ) -> Result:
        """Execute the materializer node.

        Args:
            node: The node definition containing target, args, workspace, input_schema
            ctx: The execution context
            registry: The registry (unused for materializers)
            runner: The runner instance with resolver

        Returns:
            Result dict with ok=True and result on success,
            or ok=False with error on failure
        """
        _ = registry  # Materializers don't use the registry

        target = node.get("target")
        args_spec = node.get("args", {})
        workspace_spec = node.get("workspace")
        input_schema = node.get("input_schema")

        logger.debug(f"Materializer executing: {target}")

        # Get the materializer function from the catalog
        try:
            fn = catalog.get(target)
        except KeyError as e:
            logger.error(f"Materializer not found: {target}")
            return {
                "ok": False,
                "error": {
                    "code": ErrorCode.MATERIALIZER_NOT_FOUND,
                    "message": str(e),
                },
            }

        # Resolve arguments
        args = {}
        for key, value in args_spec.items():
            args[key] = runner.resolver.resolve(value, ctx)

        # Resolve and add workspace if specified
        if workspace_spec is not None:
            workspace = runner.resolver.resolve(workspace_spec, ctx)
            args["workspace"] = workspace

        # Eager validation against input schema if provided
        if input_schema is not None:
            try:
                jsonschema.validate(args, input_schema)
            except jsonschema.ValidationError as e:
                logger.error(f"Materializer argument validation failed: {e.message}")
                return {
                    "ok": False,
                    "error": {
                        "code": ErrorCode.MATERIALIZER_INVALID_ARGS,
                        "message": f"Argument validation failed: {e.message}",
                        "details": {"path": list(e.path), "schema_path": list(e.schema_path)},
                    },
                }

        # Execute the materializer function
        try:
            result = fn(**args)
            logger.debug(f"Materializer {target} completed successfully")

            # Set result in context for emit rules
            ctx["result"] = result

            # Apply emit rules if present
            emit = node.get("emit")
            if emit:
                runner.resolver.apply_emit(emit, {"result": result}, ctx)

            return {"ok": True, "result": result}

        except Exception as e:
            tb = traceback.format_exc()
            logger.error(f"Materializer {target} failed: {e}\n{tb}")
            return {
                "ok": False,
                "error": {
                    "code": ErrorCode.MATERIALIZER_FAILED,
                    "message": str(e),
                    "details": {"traceback": tb},
                },
            }
