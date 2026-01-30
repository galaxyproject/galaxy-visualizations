import pytest

from polaris.modules.materializers.catalog import _get_catalog
from polaris.runtime import run


@pytest.fixture(autouse=True)
def initialize_runtime():
    """Initialize the materializer catalog for tests."""
    catalog = _get_catalog()
    catalog.clear()
    catalog.freeze()
    yield
    catalog.clear()


@pytest.mark.asyncio
async def test_run_minimal_agent(monkeypatch):
    async def fake_reason_structured(self, prompt, schema):
        return '{"route": "done"}'

    async def fake_load_providers(config):
        return []

    monkeypatch.setattr(
        "polaris.modules.registry.load_providers",
        fake_load_providers,
    )

    agent = {
        "nodes": {
            "start": {
                "type": "planner",
                "output_mode": "route",
                "prompt": "Decide next step",
                "routes": {
                    "done": {"description": "End workflow", "next": "end"},
                },
                "emit": {"state.decision": {"$ref": "result.route"}},
            },
            "end": {
                "type": "terminal",
                "output": {"decision": {"$ref": "state.decision"}},
            },
        },
        "start": "start",
    }

    inputs = {"transcripts": []}
    config = {
        "ai_base_url": "http://example.org",
        "ai_model": "test",
        "ai_api_key": "test",
    }
    agents = {"test_agent": agent}

    # Patch after agent is defined since Registry is created during run()
    original_run = run

    async def patched_run(config, inputs, agent_id, agents, workspace=None):
        from polaris.modules.registry import Registry

        original_reason_structured = Registry.reason_structured
        Registry.reason_structured = fake_reason_structured
        try:
            return await original_run(config, inputs, agent_id, agents, workspace)
        finally:
            Registry.reason_structured = original_reason_structured

    result = await patched_run(config, inputs, "test_agent", agents)

    assert result["last"]["ok"] is True
    assert result["last"]["result"]["decision"] == "done"
