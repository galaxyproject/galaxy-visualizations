"""Every olit error, on one base, so `except AppError` catches all of them."""

from typing import Any, Optional


class AppError(Exception):
    """Base exception for all errors."""

    code: str = "APP_ERROR"

    def __init__(self, message: str, details: Optional[dict[str, Any]] = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}

    def to_dict(self) -> dict[str, Any]:
        return {"code": self.code, "message": self.message, "details": self.details}


class HttpError(AppError):
    """HTTP request failed."""

    code = "HTTP_ERROR"

    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        details: Optional[dict[str, Any]] = None,
    ):
        super().__init__(message, details)
        self.status_code = status_code

    def to_dict(self) -> dict[str, Any]:
        result = super().to_dict()
        if self.status_code is not None:
            result["status_code"] = self.status_code
        return result


class ConfigurationError(AppError):
    """Invalid or missing configuration."""

    code = "CONFIG_ERROR"


class ProviderError(AppError):
    """Error loading or using API providers."""

    code = "PROVIDER_ERROR"


class ApiCallError(AppError):
    """Error calling an API operation."""

    code = "API_CALL_ERROR"


class CapabilityError(AppError):
    """Operation requires a capability the manifest has not granted."""

    code = "CAPABILITY_DENIED"

class AgentError(AppError):
    """Error related to agent definition or resolution."""

    code = "AGENT_ERROR"


class ExpressionError(AppError):
    """Error evaluating expressions."""

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
