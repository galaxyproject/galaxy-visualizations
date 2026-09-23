"""Shared exception hierarchy for Galaxy visualization plugins."""

from typing import Any, Optional


class AppError(Exception):
    """Base exception for all errors."""

    code: str = "APP_ERROR"

    def __init__(self, message: str, details: Optional[dict[str, Any]] = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}

    def to_dict(self) -> dict[str, Any]:
        """Serialize exception to dictionary for API responses."""
        return {
            "code": self.code,
            "message": self.message,
            "details": self.details,
        }


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
        """Serialize exception to dictionary for API responses."""
        result = super().to_dict()
        if self.status_code is not None:
            result["status_code"] = self.status_code
        return result
