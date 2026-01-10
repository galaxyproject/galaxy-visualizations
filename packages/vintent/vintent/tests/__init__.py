import json
import os
from vintent.core.completions import completions_post
from vintent.config import MESSAGE_INITIAL, PROMPT_DEFAULT


package_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dataset_path = os.path.join(package_root, "../test-data", "dataset.csv")

def build_inputs(query):
    return {
        "transcripts": [
            {"content": PROMPT_DEFAULT, "role": "system"},
            {"content": MESSAGE_INITIAL, "role": "assistant"},
            {"content": query, "role": "user"},
        ]
    }

def mock_completions(mock_sequence):
    if os.environ.get("GALAXY_KEY"):
        async def real(payload):
            return await completions_post(payload)
        return real
    return mock_tool_sequence(mock_sequence)

def mock_tool_sequence(sequence):
    state = {"i": 0}
    async def mock_completions(payload):
        i = state["i"]
        state["i"] += 1
        calls = sequence.get(i)
        if calls is None:
            return None
        return mock_tool_calls(calls)
    return mock_completions

def mock_tool_calls(calls):
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
