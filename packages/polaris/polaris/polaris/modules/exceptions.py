"""Polaris-specific exception hierarchy."""

from polaris.core.exceptions import AppError


class ConfigurationError(AppError):
    """Invalid or missing configuration."""

    code = "CONFIG_ERROR"


class AgentError(AppError):
    """Error related to agent definition or resolution."""

    code = "AGENT_ERROR"


class ExpressionError(AppError):
    """Error evaluating expressions.

    Provides detailed context about what went wrong during expression evaluation.
    """

    code = "EXPRESSION_ERROR"

    def __init__(
        self,
        message: str,
        operator: str | None = None,
        parameter: str | None = None,
        expected: str | None = None,
        received: str | None = None,
        hint: str | None = None,
        details: dict | None = None,
    ):
        # Build detailed message
        parts = [message]
        if operator:
            parts.append(f"Operator: {operator}")
        if parameter:
            parts.append(f"Parameter: {parameter}")
        if expected and received:
            parts.append(f"Expected {expected}, got {received}")
        elif expected:
            parts.append(f"Expected: {expected}")
        elif received:
            parts.append(f"Received: {received}")
        if hint:
            parts.append(f"Hint: {hint}")

        full_message = " | ".join(parts)
        super().__init__(full_message, details)

        self.operator = operator
        self.parameter = parameter
        self.expected = expected
        self.received = received
        self.hint = hint

    def to_dict(self) -> dict:
        result = super().to_dict()
        if self.operator:
            result["operator"] = self.operator
        if self.parameter:
            result["parameter"] = self.parameter
        if self.expected:
            result["expected"] = self.expected
        if self.received:
            result["received"] = self.received
        if self.hint:
            result["hint"] = self.hint
        return result


class NodeExecutionError(AppError):
    """Error executing a graph node."""

    code = "NODE_EXECUTION_ERROR"


class PlannerError(AppError):
    """Error in planner node execution."""

    code = "PLANNER_ERROR"


class ApiCallError(AppError):
    """Error calling an API operation."""

    code = "API_CALL_ERROR"


class RegistryError(AppError):
    """Error in registry operations."""

    code = "REGISTRY_ERROR"


class ProviderError(AppError):
    """Error loading or using API providers."""

    code = "PROVIDER_ERROR"
