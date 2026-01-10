import json
import pytest

from vintent.config import config
from vintent.runtime import run
from . import assert_log, assert_output, build_inputs, mock_completions, dataset_path

@pytest.mark.asyncio
async def test_histogram(monkeypatch):
    mock_replies = {
        0: [dict(name="choose_process", arguments=dict(id="range_filter", params=dict(field="Age", min=50, max=100)))],
        1: [dict(name="choose_process", arguments=dict(id="none"))],
        2: [dict(name="choose_shell", arguments=dict(shellId="histogram"))],
        3: [dict(name="fill_shell_params", arguments=dict(field="Age"))],
    }
    monkeypatch.setattr("vintent.modules.runner.completions_post", mock_completions(mock_replies))
    inputs = build_inputs("Create a histogram of age with age > 50")
    result = await run(config, inputs, dataset_path)
    assert_log("Filter rows where Age is between 50 and 100", result)
    assert_log("Selected shell: histogram", result)
    assert_log("Computed histogram bins", result)
    spec = result["widgets"][0]
    assert spec["mark"]["type"] == "bar"
    assert_output(spec, "test_histogram")

@pytest.mark.asyncio
async def test_linear_regression(monkeypatch):
    mock_replies = {
        0: [dict(name="choose_process", arguments=dict(id="range_filter", params=dict(field="Age", min=0, max=50)))],
        1: [dict(name="choose_process", arguments=dict(id="none"))],
        2: [dict(name="choose_shell", arguments=dict(shellId="linear_regression"))],
        3: [dict(name="fill_shell_params", arguments=dict())],
    }
    monkeypatch.setattr("vintent.modules.runner.completions_post", mock_completions(mock_replies))
    inputs = build_inputs("Show linear regression of Glucose and Insuling with age < 50")
    result = await run(config, inputs, dataset_path)
    assert_log("Filter rows where Age is between 0 and 50", result)
    assert_log("Selected shell: linear_regression", result)
    assert_log("Computed linear regression", result)

