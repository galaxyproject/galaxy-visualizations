"""agent.yml is validated on load against the grammar in olite/schema.py."""

import pytest
import yaml
from pydantic import ValidationError

from olite.exceptions import ConfigurationError
from olite.registry import ProcessRegistry
from olite.schema import AgentDefinition

MINIMAL = """
version: 1
id: demo
kind: agent_pipeline
start: done
nodes:
  done:
    type: terminal
"""


def test_the_shipped_graphs_validate():
    """The drift check: every graph olite ships must match the grammar."""
    registry = ProcessRegistry().load_packaged()
    graphs = [n for n in registry.names() if registry.get(n).graph is not None]
    assert graphs
    for name in graphs:
        AgentDefinition.model_validate(registry.get(name).graph)


def test_a_python_process_declares_the_same_things_a_graph_does():
    """Both kinds carry inputs and capabilities; only the body differs."""
    registry = ProcessRegistry().load_packaged()
    for name in registry.names():
        process = registry.get(name)
        assert process.inputs, f"{name} declares no inputs"
        assert process.capabilities, f"{name} declares no capabilities"
        assert (process.graph is None) != (process.fn is None), f"{name} must be one kind"


def test_the_grammar_knows_the_fields_the_processes_actually_use():
    graph = yaml.safe_load(MINIMAL)
    graph["when_to_use"] = "when the user asks for a demo"
    graph["capabilities"] = ["llm", "read"]
    model = AgentDefinition.model_validate(graph)
    assert model.when_to_use and model.capabilities == ["llm", "read"]


def test_a_malformed_process_fails_at_load_with_a_readable_error():
    with pytest.raises(ConfigurationError) as e:
        ProcessRegistry().register_yaml("version: 1\nid: broken\nstart: nowhere\nnodes: {}")
    assert "Invalid agent.yml" in str(e.value)


def test_a_start_node_that_does_not_exist_is_caught():
    with pytest.raises(ValidationError) as e:
        AgentDefinition.model_validate(
            {"version": 1, "id": "x", "start": "missing", "nodes": {"done": {"type": "terminal"}}}
        )
    assert "missing" in str(e.value)


def test_an_unknown_field_is_refused_rather_than_ignored():
    """`extra: forbid` is what makes drift visible instead of silent."""
    graph = yaml.safe_load(MINIMAL)
    graph["typo_field"] = 1
    with pytest.raises(ValidationError):
        AgentDefinition.model_validate(graph)


def test_a_process_without_an_id_is_refused():
    with pytest.raises(ConfigurationError):
        ProcessRegistry().register_yaml("version: 1\nstart: done\nnodes:\n  done:\n    type: terminal\n")
