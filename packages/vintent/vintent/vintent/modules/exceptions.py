"""Vintent-specific exception classes."""

from vintent.core.exceptions import AppError


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
