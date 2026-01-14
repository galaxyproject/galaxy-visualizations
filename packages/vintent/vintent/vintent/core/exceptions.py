"""Custom exception hierarchy."""

from typing import Any, Dict, Optional


class AppError(Exception):
    """Base exception for all errors."""

    code: str = "APP_ERROR"

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}

    def to_dict(self) -> Dict[str, Any]:
        """Serialize exception to dictionary for API responses."""
        return {
            "code": self.code,
            "message": self.message,
            "details": self.details,
        }


class ConfigurationError(AppError):
    """Invalid or missing configuration."""

    code = "CONFIG_ERROR"


class DataError(AppError):
    """Error with input data (CSV, profile, etc.)."""

    code = "DATA_ERROR"


class ProcessError(AppError):
    """Error during data processing."""

    code = "PROCESS_ERROR"


class CompletionsError(AppError):
    """Error communicating with LLM API."""

    code = "COMPLETIONS_ERROR"


class CompletionsParseError(CompletionsError):
    """Failed to parse LLM response."""

    code = "COMPLETIONS_PARSE_ERROR"


class HttpError(AppError):
    """HTTP request failed."""

    code = "HTTP_ERROR"

    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message, details)
        self.status_code = status_code

    def to_dict(self) -> Dict[str, Any]:
        """Serialize exception to dictionary for API responses."""
        result = super().to_dict()
        if self.status_code is not None:
            result["status_code"] = self.status_code
        return result
