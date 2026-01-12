"""Tests for the custom exception hierarchy."""

import pytest

from vintent.core.exceptions import (
    AppError,
    CompletionsError,
    CompletionsParseError,
    ConfigurationError,
    DataError,
    HttpError,
    ProcessError,
)
from vintent.modules.shells.base import ShellError


class TestAppError:
    def test_instantiation_with_message_only(self):
        err = AppError("Something went wrong")
        assert err.message == "Something went wrong"
        assert err.details == {}
        assert err.code == "APP_ERROR"
        assert str(err) == "Something went wrong"

    def test_instantiation_with_details(self):
        details = {"key": "value", "count": 42}
        err = AppError("Error occurred", details=details)
        assert err.message == "Error occurred"
        assert err.details == details

    def test_to_dict(self):
        err = AppError("Test error", details={"foo": "bar"})
        result = err.to_dict()
        assert result == {
            "code": "APP_ERROR",
            "message": "Test error",
            "details": {"foo": "bar"},
        }


class TestExceptionInheritance:
    @pytest.mark.parametrize(
        "exception_class,expected_code",
        [
            (ConfigurationError, "CONFIG_ERROR"),
            (DataError, "DATA_ERROR"),
            (ProcessError, "PROCESS_ERROR"),
            (ShellError, "SHELL_ERROR"),
            (CompletionsError, "COMPLETIONS_ERROR"),
            (CompletionsParseError, "COMPLETIONS_PARSE_ERROR"),
            (HttpError, "HTTP_ERROR"),
        ],
    )
    def test_inherits_from_APP_ERROR(self, exception_class, expected_code):
        err = exception_class("Test message")
        assert isinstance(err, AppError)
        assert isinstance(err, Exception)
        assert err.code == expected_code

    def test_completions_parse_error_inherits_from_completions_error(self):
        err = CompletionsParseError("Parse failed")
        assert isinstance(err, CompletionsError)
        assert isinstance(err, AppError)


class TestHttpError:
    def test_instantiation_with_status_code(self):
        err = HttpError("Not found", status_code=404)
        assert err.message == "Not found"
        assert err.status_code == 404
        assert err.code == "HTTP_ERROR"

    def test_instantiation_without_status_code(self):
        err = HttpError("Connection failed")
        assert err.status_code is None

    def test_to_dict_with_status_code(self):
        err = HttpError("Server error", status_code=500, details={"url": "/api"})
        result = err.to_dict()
        assert result == {
            "code": "HTTP_ERROR",
            "message": "Server error",
            "details": {"url": "/api"},
            "status_code": 500,
        }

    def test_to_dict_without_status_code(self):
        err = HttpError("Timeout")
        result = err.to_dict()
        assert "status_code" not in result


class TestExceptionRaising:
    def test_can_be_caught_as_APP_ERROR(self):
        with pytest.raises(AppError) as exc_info:
            raise ProcessError("Process failed", details={"process_id": "pca"})
        assert exc_info.value.code == "PROCESS_ERROR"
        assert exc_info.value.details == {"process_id": "pca"}

    def test_can_be_caught_as_exception(self):
        with pytest.raises(Exception):
            raise DataError("Invalid CSV")
