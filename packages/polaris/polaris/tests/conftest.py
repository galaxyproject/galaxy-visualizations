"""Shared test fixtures for Polaris tests."""

import pytest


@pytest.fixture
def mock_config():
    """Standard configuration for tests."""
    return {
        "ai_base_url": "http://test.example.com",
        "ai_model": "test-model",
        "ai_api_key": "test-api-key",
    }


@pytest.fixture
def mock_completions_response():
    """Standard LLM completions response with tool call."""
    return {
        "choices": [
            {
                "message": {
                    "tool_calls": [
                        {
                            "function": {
                                "name": "route",
                                "arguments": '{"next": "end"}',
                            }
                        }
                    ]
                }
            }
        ]
    }


@pytest.fixture
def mock_agent():
    """Minimal agent definition for tests."""
    return {
        "id": "test-agent",
        "start": "start",
        "nodes": {
            "start": {
                "type": "terminal",
                "output": {"message": "done"},
            }
        },
    }


@pytest.fixture
def mock_context():
    """Standard execution context for tests."""
    return {
        "inputs": {"test_input": "value"},
        "state": {},
        "nodeId": "test-node",
        "graphId": "test-graph",
        "graph": {
            "id": "test-graph",
            "start": "start",
            "nodes": {},
        },
    }


@pytest.fixture
def resolve_identity():
    """Identity resolve function for expression tests."""
    def resolve(value, ctx):
        return value
    return resolve


@pytest.fixture
def resolve_refs():
    """Resolve function that handles $ref for expression tests."""
    def resolve(value, ctx):
        if isinstance(value, dict) and "$ref" in value:
            ref = value["$ref"]
            parts = ref.split(".")
            obj = ctx
            for part in parts:
                if isinstance(obj, dict):
                    obj = obj.get(part)
                else:
                    return None
            return obj
        return value
    return resolve
