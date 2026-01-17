"""Template resolution for agent pipelines.

Handles $ref path lookups, $expr expression evaluation, and emit statements.
"""

import logging
from typing import Any

from .constants import ControlOp
from .exceptions import ExpressionError
from .expressions import EXPR_OPS, get_available_operators
from .refs import get_path
from .types import Context

logger = logging.getLogger(__name__)


class Resolver:
    """Resolves templates, expressions, and references in agent definitions.

    Extracts template resolution logic from Runner for better separation of concerns.
    """

    def __init__(self, state: dict[str, Any]) -> None:
        """Initialize resolver with shared state.

        Args:
            state: The runner's state dictionary (shared reference).
        """
        self.state = state

    def resolve(self, value: Any, ctx: Context) -> Any:
        """Recursively resolve templates in a value.

        Handles:
        - {$ref: "path.to.value"} - path lookups
        - {$expr: {op: "...", ...}} - expression evaluation
        - Nested dicts and lists

        Args:
            value: The value to resolve (may contain $ref or $expr).
            ctx: The current execution context.

        Returns:
            The resolved value.
        """
        if isinstance(value, dict):
            if "$ref" in value:
                return get_path(value["$ref"], ctx, self.state)
            elif "$expr" in value:
                return self.eval_expr(value["$expr"], ctx)
            else:
                return {k: self.resolve(v, ctx) for k, v in value.items()}
        elif isinstance(value, list):
            return [self.resolve(v, ctx) for v in value]
        else:
            return value

    def eval_expr(self, expr: dict[str, Any], ctx: Context) -> Any:
        """Evaluate an expression.

        Args:
            expr: Expression definition with 'op' and operator-specific params.
            ctx: The current execution context.

        Returns:
            The expression result.

        Raises:
            ExpressionError: If the operator is unknown or evaluation fails.
        """
        op = expr.get("op", "")
        fn = EXPR_OPS.get(op)

        if fn:
            try:
                return fn(expr, ctx, self.resolve)
            except ExpressionError:
                raise
            except Exception as e:
                logger.exception("Unexpected error in expression evaluation")
                raise ExpressionError(
                    f"Unexpected error: {e}",
                    operator=op,
                    hint="This may be a bug in the expression implementation."
                ) from e
        else:
            available = get_available_operators()
            raise ExpressionError(
                f"Unknown expression operator: '{op}'",
                operator=op,
                expected=f"one of: {', '.join(available)}",
                hint="Check spelling and available operators."
            )

    def eval_branch(self, condition: dict[str, Any] | None, ctx: Context) -> dict[str, str | None]:
        """Evaluate a branch condition to determine the next node.

        Args:
            condition: Branch condition with cases and default.
            ctx: The current execution context.

        Returns:
            Dict with 'next' key containing the next node ID or None.
        """
        next_val = None

        if condition and condition.get("op") == ControlOp.BRANCH:
            for case in condition.get("cases", []):
                when = case.get("when", {})
                if isinstance(when, dict):
                    match = True
                    for path, expected in when.items():
                        actual = get_path(path, ctx, self.state)
                        if actual != expected:
                            match = False
                            break
                    if match:
                        next_val = case.get("next")
                        break

            if next_val is None:
                next_val = condition.get("default")

        return {"next": str(next_val) if next_val is not None else None}

    def apply_emit(
        self,
        emit: dict[str, Any] | None,
        payload: dict[str, Any] | None,
        ctx: Context,
    ) -> None:
        """Apply emit statements to update state.

        Args:
            emit: Emit configuration mapping destinations to sources.
            payload: The result payload from node execution.
            ctx: The current execution context.
        """
        if not emit or not payload:
            return

        for dest, src in emit.items():
            # Strip "state." prefix if present
            key = dest[6:] if dest.startswith("state.") else dest

            if isinstance(src, dict):
                # Resolve template expressions
                self.state[key] = self.resolve(src, ctx)
            elif isinstance(src, str):
                # Direct field reference from payload
                self.state[key] = payload.get(src)
            else:
                # Literal value
                self.state[key] = src
