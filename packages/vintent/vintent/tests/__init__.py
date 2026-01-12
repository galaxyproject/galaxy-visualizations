import json
import os
from pathlib import Path
from vintent.core.completions import completions_post
from vintent.config import MESSAGE_INITIAL, PROMPT_DEFAULT


package_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dataset_path = os.path.join(package_root, "../test-data", "dataset.csv")


def _round_floats(obj, precision=10):
    """Round floats to avoid platform-specific precision differences."""
    if isinstance(obj, float):
        return round(obj, precision)
    elif isinstance(obj, dict):
        return {k: _round_floats(v, precision) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_round_floats(item, precision) for item in obj]
    return obj


def assert_log(assertion, result):
    assert any(assertion in l for l in result["logs"])

def assert_output(content, file_name, update_on_mismatch=False):
    file_path = Path(os.path.join(package_root, f"../test-results/{file_name}.json"))
    # Use minified JSON (single line) for compact storage
    content_to_compare = json.dumps(_round_floats(content), sort_keys=True, separators=(',', ':'))
    if file_path.exists():
        existing_data = json.loads(file_path.read_text())
        existing_content = json.dumps(_round_floats(existing_data), sort_keys=True, separators=(',', ':'))
        if existing_content == content_to_compare:
            return True
        if update_on_mismatch:
            print(f"Warning: Content mismatch in '{file_name}'. Updating file.")
            file_path.write_text(content_to_compare + '\n')
            return False
        else:
            raise AssertionError(f"Content mismatch in '{file_name}'")
    else:
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content_to_compare + '\n')
        raise FileNotFoundError(
            f"File '{file_name}' was created with the expected content.\n"
            f"Please review it and re-run the test."
        )

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
