"""Handler for materializer nodes."""

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
    """Handler for materializer nodes."""

    async def execute(
        self,
        node: NodeDefinition,
        ctx: Context,
        registry: "Registry",
        runner: Any,
    ) -> Result:
        """Execute the materializer node."""
        _ = registry  # Materializers don't use the registry

        target = str(node.get("target"))
        args_spec = node.get("args", {})
        workspace_spec = node.get("workspace")
        input_schema = node.get("input_schema")

        logger.debug("Materializer executing: %s", target)

        # Get the materializer function from the catalog
        try:
            fn = catalog.get(target)
        except KeyError as e:
            logger.error("Materializer not found: %s", target)
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
                logger.error("Materializer argument validation failed: %s", e.message)
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
            logger.debug("Materializer %s completed successfully", target)

            # Set result in context for emit rules
            ctx["result"] = result

            # Apply emit rules if present
            emit = node.get("emit")
            if emit:
                runner.resolver.apply_emit(emit, {"result": result}, ctx)

            return {"ok": True, "result": result}

        except Exception as e:
            tb = traceback.format_exc()
            logger.error("Materializer %s failed: %s\n%s", target, e, tb)
            return {
                "ok": False,
                "error": {
                    "code": ErrorCode.MATERIALIZER_FAILED,
                    "message": str(e),
                    "details": {"traceback": tb},
                },
            }
