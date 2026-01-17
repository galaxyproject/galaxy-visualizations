import pytest

from polaris.modules.registry import Registry


@pytest.mark.asyncio
async def test_registry_plan_requires_tool_call(monkeypatch):
    async def fake_completions_post(payload):
        return {
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {
                                "function": {
                                    "name": "route",
                                    "arguments": '{"next": "foo"}',
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

    registry = Registry({"ai_base_url": "x"})

    ctx = {
        "graph": {"nodes": {"foo": {}}},
        "inputs": {"transcripts": []},
        "state": {},
    }

    spec = {"node": {}, "outputSchema": None}

    result = await registry.plan(ctx, spec)

    assert result["next"] == "foo"
