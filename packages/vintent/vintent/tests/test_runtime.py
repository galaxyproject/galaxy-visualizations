import json
import pytest
from vintent.modules.runner import Runner
from . import mock_tool_sequence

@pytest.mark.asyncio
async def test_runner_histogram_flow_logs_and_widget(monkeypatch, tmp_path):
    csv_text = "Age\n21\n25\n30\n40\n50\n60\n70\n80\n"
    csv_file = tmp_path / "data.csv"
    csv_file.write_text(csv_text)
    
    mock_completions = {
        0: [dict(name="choose_process", arguments=dict(id="range_filter", params=dict(field="Age", min=0, max=100)))],
        1: [dict(name="choose_process", arguments=dict(id="none"))],
        2: [dict(name="choose_shell", arguments=dict(shellId="histogram"))],
        3: [dict(name="fill_shell_params", arguments=dict(field="Age"))],
    }
    monkeypatch.setattr("vintent.modules.runner.completions_post", mock_tool_sequence(mock_completions))
    runner = Runner(dict(ai_api_key="key", ai_base_url="url", ai_model="model"))

    transcripts = [{"role": "user", "content": "Create a histogram of age"}]
    result = await runner.run(transcripts, str(csv_file))

    assert "Filter rows where Age is between 0 and 100." in result["logs"]
    assert "Selected shell: histogram" in result["logs"]
    assert any("Computed histogram bins" in l for l in result["logs"])

    assert len(result["widgets"]) == 1
    spec = result["widgets"][0]
    assert spec["mark"]["type"] == "bar"
    assert "$schema" in spec
    assert "data" in spec
