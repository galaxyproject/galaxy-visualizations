"""Tests for PlannerOutputShim."""

import pytest

from polaris.modules.constants import ErrorCode
from polaris.modules.handlers.planner_shim import PlannerOutputShim, build_route_schema


class TestPlannerOutputShim:
    """Tests for the planner output shim."""

    def setup_method(self):
        self.shim = PlannerOutputShim()

    def test_validate_valid_json(self):
        """Test validation of valid JSON against schema."""
        schema = {
            "type": "object",
            "required": ["name"],
            "properties": {"name": {"type": "string"}},
        }
        raw = '{"name": "test"}'

        result = self.shim.validate(raw, schema)

        assert result["ok"] is True
        assert result["result"] == {"name": "test"}

    def test_validate_invalid_json_syntax(self):
        """Test handling of invalid JSON syntax."""
        schema = {"type": "object"}
        raw = "not valid json"

        result = self.shim.validate(raw, schema)

        assert result["ok"] is False
        assert result["error"]["code"] == ErrorCode.PLANNER_INVALID_JSON
        assert "raw_truncated" in result["error"]["details"]

    def test_validate_schema_violation(self):
        """Test handling of schema validation failure."""
        schema = {
            "type": "object",
            "required": ["name"],
            "properties": {"name": {"type": "string"}},
        }
        raw = '{"name": 123}'  # Wrong type

        result = self.shim.validate(raw, schema)

        assert result["ok"] is False
        assert result["error"]["code"] == ErrorCode.PLANNER_SCHEMA_VALIDATION_FAILED
        assert "path" in result["error"]["details"]

    def test_validate_missing_required_field(self):
        """Test handling of missing required field."""
        schema = {
            "type": "object",
            "required": ["name", "value"],
            "properties": {
                "name": {"type": "string"},
                "value": {"type": "number"},
            },
        }
        raw = '{"name": "test"}'  # Missing 'value'

        result = self.shim.validate(raw, schema)

        assert result["ok"] is False
        assert result["error"]["code"] == ErrorCode.PLANNER_SCHEMA_VALIDATION_FAILED

    def test_validate_route_enum(self):
        """Test validation of route enum value."""
        schema = build_route_schema({
            "process": {"description": "Continue", "next": "process_node"},
            "skip": {"description": "Skip", "next": "done"},
        })
        raw = '{"route": "process"}'

        result = self.shim.validate(raw, schema)

        assert result["ok"] is True
        assert result["result"] == {"route": "process"}

    def test_validate_invalid_route_enum(self):
        """Test rejection of invalid route enum value."""
        schema = build_route_schema({
            "process": {"description": "Continue", "next": "process_node"},
            "skip": {"description": "Skip", "next": "done"},
        })
        raw = '{"route": "invalid"}'

        result = self.shim.validate(raw, schema)

        assert result["ok"] is False
        assert result["error"]["code"] == ErrorCode.PLANNER_SCHEMA_VALIDATION_FAILED

    def test_validate_complex_schema(self):
        """Test validation of complex nested schema."""
        schema = {
            "type": "object",
            "required": ["config"],
            "properties": {
                "config": {
                    "type": "object",
                    "required": ["threshold"],
                    "properties": {
                        "threshold": {"type": "number", "minimum": 0, "maximum": 1},
                        "tags": {"type": "array", "items": {"type": "string"}},
                    },
                },
            },
        }
        raw = '{"config": {"threshold": 0.5, "tags": ["a", "b"]}}'

        result = self.shim.validate(raw, schema)

        assert result["ok"] is True
        assert result["result"]["config"]["threshold"] == 0.5
        assert result["result"]["config"]["tags"] == ["a", "b"]

    def test_validate_additional_properties_rejected(self):
        """Test that additional properties are rejected when schema forbids them."""
        schema = {
            "type": "object",
            "required": ["route"],
            "properties": {"route": {"enum": ["a", "b"]}},
            "additionalProperties": False,
        }
        raw = '{"route": "a", "extra": "field"}'

        result = self.shim.validate(raw, schema)

        assert result["ok"] is False
        assert result["error"]["code"] == ErrorCode.PLANNER_SCHEMA_VALIDATION_FAILED


class TestBuildRouteSchema:
    """Tests for build_route_schema helper."""

    def test_build_route_schema_single_route(self):
        """Test schema generation for single route."""
        routes = {"process": {"description": "Process data", "next": "process_node"}}

        schema = build_route_schema(routes)

        assert schema["type"] == "object"
        assert schema["required"] == ["route"]
        assert schema["properties"]["route"]["enum"] == ["process"]
        assert schema["additionalProperties"] is False

    def test_build_route_schema_multiple_routes(self):
        """Test schema generation for multiple routes."""
        routes = {
            "process": {"description": "Process", "next": "process_node"},
            "skip": {"description": "Skip", "next": "skip_node"},
            "retry": {"description": "Retry", "next": "retry_node"},
        }

        schema = build_route_schema(routes)

        assert set(schema["properties"]["route"]["enum"]) == {"process", "skip", "retry"}

    def test_build_route_schema_empty_routes(self):
        """Test schema generation for empty routes."""
        routes = {}

        schema = build_route_schema(routes)

        assert schema["properties"]["route"]["enum"] == []
