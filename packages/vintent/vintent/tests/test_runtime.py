import os
import json
import pytest

from vintent.config import config, MESSAGE_INITIAL, PROMPT_DEFAULT
from vintent.runtime import run
from . import completions_backend

package_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

@pytest.mark.asyncio
async def test_runner_histogram_flow_logs_and_widget(monkeypatch, tmp_path):

    mock_completions = {
        0: [dict(name="choose_process", arguments=dict(id="range_filter", params=dict(field="Age", min=0, max=100)))],
        1: [dict(name="choose_process", arguments=dict(id="none"))],
        2: [dict(name="choose_shell", arguments=dict(shellId="histogram"))],
        3: [dict(name="fill_shell_params", arguments=dict(field="Age"))],
    }
    monkeypatch.setattr("vintent.modules.runner.completions_post", completions_backend(mock_completions))

    inputs = {
        "transcripts": [
            {"content": PROMPT_DEFAULT, "role": "system"},
            {"content": MESSAGE_INITIAL, "role": "assistant"},
            {"content": "Create a histogram of age", "role": "user"},
        ]
    }

    dataset_path = os.path.join(package_root, "../test-data", "dataset.csv")
    result = await run(config, inputs, dataset_path)

    assert "Filter rows where Age is between 0 and 100." in result["logs"]
    assert "Selected shell: histogram" in result["logs"]
    assert any("Computed histogram bins" in l for l in result["logs"])

    assert len(result["widgets"]) == 1
    spec = result["widgets"][0]
    assert spec["mark"]["type"] == "bar"
    assert "$schema" in spec
    assert "data" in spec
