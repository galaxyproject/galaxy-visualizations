"""Planner output shim for JSON validation.

The shim has exactly one responsibility: parse JSON and validate against a schema.
It does not interpret routes, select next nodes, or make control flow decisions.
"""

import json
import logging
from typing import Any

import jsonschema

from ..constants import ErrorCode
from ..types import Result

logger = logging.getLogger(__name__)


class PlannerOutputShim:
    """Parses and validates planner JSON output. Nothing else.

    The shim is stateless and has no knowledge of routing or control flow.
    All control flow decisions are made by the runner based on the validated output.
    """

    def validate(
        self,
        raw_response: str,
        schema: dict[str, Any],
    ) -> Result:
        """Parse JSON and validate against schema.

        Args:
            raw_response: Raw string from LLM
            schema: JSON Schema to validate against

        Returns:
            Result with validated data or error
        """
        # Step 1: Parse JSON
        try:
            data = json.loads(raw_response)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse planner JSON output: {e}")
            return {
                "ok": False,
                "error": {
                    "code": ErrorCode.PLANNER_INVALID_JSON,
                    "message": f"Failed to parse JSON: {e.msg}",
                    "details": {
                        "position": e.pos,
                        "raw_truncated": raw_response[:200],
                    },
                },
            }

        # Step 2: Validate against schema
        try:
            jsonschema.validate(data, schema)
        except jsonschema.ValidationError as e:
            logger.error(f"Planner output failed schema validation: {e.message}")
            return {
                "ok": False,
                "error": {
                    "code": ErrorCode.PLANNER_SCHEMA_VALIDATION_FAILED,
                    "message": f"Schema validation failed: {e.message}",
                    "details": {
                        "path": list(e.path),
                        "schema_path": list(e.schema_path),
                        "value": e.instance,
                    },
                },
            }

        # Step 3: Return validated data
        logger.debug("Planner output validated successfully")
        return {"ok": True, "result": data}


def build_route_schema(routes: dict[str, Any]) -> dict[str, Any]:
    """Build JSON schema for route enum.

    Args:
        routes: Dict mapping route names to route specs

    Returns:
        JSON Schema that validates {"route": <enum>}
    """
    return {
        "type": "object",
        "required": ["route"],
        "properties": {
            "route": {"enum": list(routes.keys())}
        },
        "additionalProperties": False,
    }
