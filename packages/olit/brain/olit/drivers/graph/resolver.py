"""Template resolution for agent pipelines."""

import logging
from typing import Any

from .constants import ControlOp
from olit.exceptions import ExpressionError
from .expressions import EXPR_OPS, get_available_operators
from .refs import get_path
from .types import Context

logger = logging.getLogger(__name__)


class Resolver:
    """Resolves templates, expressions, and references in agent definitions."""

    def __init__(self, state: dict[str, Any]) -> None:
        """Initialize resolver with shared state."""
        self.state = state

    def resolve(self, value: Any, ctx: Context) -> Any:
        """Recursively resolve templates in a value."""
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
        """Evaluate an expression."""
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
        """Evaluate a branch condition to determine the next node."""
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
        """Apply emit statements to update state."""
        if not emit or not payload:
            return

        for dest, src in emit.items():
            key = dest[6:] if dest.startswith("state.") else dest
            if isinstance(src, dict) and "$append" in src:
                appended = src["$append"]
                value = payload.get("result") if appended == "result" else self.resolve(appended, ctx)
                self.state.setdefault(key, [])
                if isinstance(self.state[key], list):
                    self.state[key].append(value)
            elif isinstance(src, dict):
                self.state[key] = self.resolve(src, ctx)
            elif isinstance(src, str):
                self.state[key] = payload.get(src)
            else:
                self.state[key] = src
