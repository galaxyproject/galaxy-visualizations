import json
import os
from vintent.core.completions import completions_post


def completions_backend(mock_sequence):
    if os.environ.get("GALAXY_KEY"):
        async def real(payload):
            return await completions_post(payload)
        return real
    return mock_tool_sequence(mock_sequence)

def mock_tool_sequence(sequence):
    state = {"i": 0}
    async def fake_completions(payload):
        i = state["i"]
        state["i"] += 1
        calls = sequence.get(i)
        if calls is None:
            return None
        return tool_calls(calls)
    return fake_completions

def tool_calls(calls):
    return {
        "choices": [
            {
                "message": {
                    "tool_calls": [
                        {
                            "function": {
                                "name": c["name"],
                                "arguments": json.dumps(c.get("arguments", {})),
                            }
                        }
                        for c in calls
                    ]
                }
            }
        ]
    }
