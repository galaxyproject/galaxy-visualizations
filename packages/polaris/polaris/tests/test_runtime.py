import pytest

from polaris.runtime import run


@pytest.mark.asyncio
async def test_run_minimal_agent(monkeypatch):
    async def fake_completions_post(payload):
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

    monkeypatch.setattr(
        "polaris.modules.registry.completions_post",
        fake_completions_post,
    )

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
                "next": None,
            }
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

    result = await run(config, inputs, "test_agent", agents)

    assert result["last"]["result"]["next"] == "end"
    assert result["last"]["ok"] is True
