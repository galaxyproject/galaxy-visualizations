"""Tests for MaterializerHandler."""

import pytest

from polaris.modules.constants import ErrorCode
from polaris.modules.handlers import MaterializerHandler
from polaris.modules.materializers.catalog import _get_catalog, register

from .mocks import MockRegistry, MockRunner


@pytest.fixture(autouse=True)
def clean_catalog():
    """Clean the catalog before and after each test."""
    catalog = _get_catalog()
    catalog.clear()

    # Register test materializers
    @register("test.double")
    def double(x: int) -> int:
        return x * 2

    @register("test.concat")
    def concat(a: str, b: str) -> str:
        return a + b

    @register("test.with_workspace")
    def with_workspace(workspace: str, data: str) -> str:
        return f"{workspace}:{data}"

    @register("test.raises")
    def raises_error() -> None:
        raise ValueError("Intentional error")

    catalog.freeze()
    yield
    catalog.clear()


class TestMaterializerHandler:
    @pytest.mark.asyncio
    async def test_execute_simple_function(self, mock_context):
        """Test executing a simple materializer function."""
        handler = MaterializerHandler()
        runner = MockRunner()
        node = {
            "type": "materializer",
            "target": "test.double",
            "args": {"x": 5},
        }

        result = await handler.execute(node, mock_context, MockRegistry(), runner)

        assert result["ok"] is True
        assert result["result"] == 10

    @pytest.mark.asyncio
    async def test_execute_with_multiple_args(self, mock_context):
        """Test executing with multiple arguments."""
        handler = MaterializerHandler()
        runner = MockRunner()
        node = {
            "type": "materializer",
            "target": "test.concat",
            "args": {"a": "hello", "b": "world"},
        }

        result = await handler.execute(node, mock_context, MockRegistry(), runner)

        assert result["ok"] is True
        assert result["result"] == "helloworld"

    @pytest.mark.asyncio
    async def test_execute_with_workspace(self, mock_context):
        """Test executing with workspace argument."""
        handler = MaterializerHandler()
        runner = MockRunner()
        node = {
            "type": "materializer",
            "target": "test.with_workspace",
            "args": {"data": "test_data"},
            "workspace": "/tmp/workspace",
        }

        result = await handler.execute(node, mock_context, MockRegistry(), runner)

        assert result["ok"] is True
        assert result["result"] == "/tmp/workspace:test_data"

    @pytest.mark.asyncio
    async def test_execute_unknown_target_fails(self, mock_context):
        """Test that unknown target returns error."""
        handler = MaterializerHandler()
        runner = MockRunner()
        node = {
            "type": "materializer",
            "target": "nonexistent.materializer",
            "args": {},
        }

        result = await handler.execute(node, mock_context, MockRegistry(), runner)

        assert result["ok"] is False
        assert result["error"]["code"] == ErrorCode.MATERIALIZER_NOT_FOUND

    @pytest.mark.asyncio
    async def test_execute_function_exception_fails(self, mock_context):
        """Test that function exceptions are captured."""
        handler = MaterializerHandler()
        runner = MockRunner()
        node = {
            "type": "materializer",
            "target": "test.raises",
            "args": {},
        }

        result = await handler.execute(node, mock_context, MockRegistry(), runner)

        assert result["ok"] is False
        assert result["error"]["code"] == ErrorCode.MATERIALIZER_FAILED
        assert "Intentional error" in result["error"]["message"]
        assert "traceback" in result["error"]["details"]

    @pytest.mark.asyncio
    async def test_execute_sets_result_in_context(self, mock_context):
        """Test that result is set in context."""
        handler = MaterializerHandler()
        runner = MockRunner()
        node = {
            "type": "materializer",
            "target": "test.double",
            "args": {"x": 7},
        }

        await handler.execute(node, mock_context, MockRegistry(), runner)

        assert mock_context["result"] == 14

    @pytest.mark.asyncio
    async def test_execute_applies_emit(self, mock_context):
        """Test that emit rules are applied."""
        handler = MaterializerHandler()
        runner = MockRunner()
        node = {
            "type": "materializer",
            "target": "test.double",
            "args": {"x": 3},
            "emit": {"state.doubled": "result"},
        }

        await handler.execute(node, mock_context, MockRegistry(), runner)

        assert len(runner.emitted) == 1

    @pytest.mark.asyncio
    async def test_execute_with_input_schema_valid(self, mock_context):
        """Test that valid args pass input schema validation."""
        handler = MaterializerHandler()
        runner = MockRunner()
        node = {
            "type": "materializer",
            "target": "test.double",
            "args": {"x": 10},
            "input_schema": {
                "type": "object",
                "required": ["x"],
                "properties": {
                    "x": {"type": "integer"},
                },
            },
        }

        result = await handler.execute(node, mock_context, MockRegistry(), runner)

        assert result["ok"] is True
        assert result["result"] == 20

    @pytest.mark.asyncio
    async def test_execute_with_input_schema_invalid(self, mock_context):
        """Test that invalid args fail input schema validation."""
        handler = MaterializerHandler()
        runner = MockRunner()
        node = {
            "type": "materializer",
            "target": "test.double",
            "args": {"x": "not_an_integer"},
            "input_schema": {
                "type": "object",
                "required": ["x"],
                "properties": {
                    "x": {"type": "integer"},
                },
            },
        }

        result = await handler.execute(node, mock_context, MockRegistry(), runner)

        assert result["ok"] is False
        assert result["error"]["code"] == ErrorCode.MATERIALIZER_INVALID_ARGS

    @pytest.mark.asyncio
    async def test_execute_with_input_schema_missing_required(self, mock_context):
        """Test that missing required args fail validation."""
        handler = MaterializerHandler()
        runner = MockRunner()
        node = {
            "type": "materializer",
            "target": "test.concat",
            "args": {"a": "hello"},  # Missing 'b'
            "input_schema": {
                "type": "object",
                "required": ["a", "b"],
                "properties": {
                    "a": {"type": "string"},
                    "b": {"type": "string"},
                },
            },
        }

        result = await handler.execute(node, mock_context, MockRegistry(), runner)

        assert result["ok"] is False
        assert result["error"]["code"] == ErrorCode.MATERIALIZER_INVALID_ARGS
