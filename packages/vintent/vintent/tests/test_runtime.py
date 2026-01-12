import json
import pytest

from vintent.config import config
from vintent.runtime import run
from . import assert_log, assert_output, build_inputs, mock_completions, dataset_path

# Config for combined pipeline (fast, fewer LLM calls)
config_combined = {**config, "ai_pipeline_combine": True}

# Config for sequential pipeline (more reliable for local models)
# Note: Default is already False (sequential), but explicit for test clarity
config_sequential = {**config, "ai_pipeline_combine": False}


# Note: With the combined pipeline using CombinedDecisionPhase:
# - Call 0: Optional tools (parse_intent + choose_process) - parallel, may not call all
# - Call 1: choose_shell (forced)
# - Call 2: fill_shell_params (forced)


@pytest.mark.asyncio
async def test_histogram(monkeypatch):
    mock_replies = {
        0: [
            dict(name="parse_intent", arguments=dict(goal="distribution", shell_fields=["Age"], extract_fields=["Age"])),
            dict(name="choose_process", arguments=dict(id="range_filter", params=dict(field="Age", min=50))),
        ],
        1: [dict(name="choose_shell", arguments=dict(shellId="histogram"))],
        2: [dict(name="fill_shell_params", arguments=dict(field="Age"))],
    }
    monkeypatch.setattr("vintent.core.providers.completions_post", mock_completions(mock_replies))
    inputs = build_inputs("Create a histogram of age with age > 50")
    result = await run(config_combined, inputs, dataset_path)
    assert_log("Filter rows where Age is >= 50.", result)
    assert_log("Visualizing Histogram.", result)
    assert_log("Computed histogram bins", result)
    assert_output(result["spec"], "test_histogram")


@pytest.mark.asyncio
async def test_linear_regression(monkeypatch):
    mock_replies = {
        0: [
            dict(name="parse_intent", arguments=dict(goal="relationship", shell_fields=["Glucose", "Insulin"], extract_fields=["Age"])),
            dict(name="choose_process", arguments=dict(id="range_filter", params=dict(field="Age", min=0, max=50))),
        ],
        1: [dict(name="choose_shell", arguments=dict(shellId="linear_regression"))],
        2: [dict(name="fill_shell_params", arguments=dict(x="Glucose", y="Insulin"))],
    }
    monkeypatch.setattr("vintent.core.providers.completions_post", mock_completions(mock_replies))
    inputs = build_inputs("Show linear regression of Glucose and Insuling with age < 50")
    result = await run(config_combined, inputs, dataset_path)
    assert_log("Filter rows where Age is between 0 and 50.", result)
    assert_log("Visualizing Linear Regression.", result)
    assert_log("Computed linear regression", result)
    assert_output(result["spec"], "test_linear_regression")


@pytest.mark.asyncio
async def test_correlation_matrix(monkeypatch):
    mock_replies = {
        0: [
            dict(name="parse_intent", arguments=dict(goal="relationship", shell_fields=[], extract_fields=[])),
            dict(name="choose_process", arguments=dict(id="none")),
        ],
        1: [dict(name="choose_shell", arguments=dict(shellId="heatmap_correlation"))],
        2: [dict(name="fill_shell_params", arguments=dict())],
    }
    monkeypatch.setattr("vintent.core.providers.completions_post", mock_completions(mock_replies))
    inputs = build_inputs("Show heatmap of all columns")
    result = await run(config_combined, inputs, dataset_path)
    assert_output(result["spec"], "test_correlation_matrix")


# ============================================================================
# Additional test cases for realistic user prompts
# ============================================================================


@pytest.mark.asyncio
async def test_scatter_bmi_glucose(monkeypatch):
    """Test scatter plot for exploring relationship between two quantitative variables."""
    mock_replies = {
        0: [
            dict(name="parse_intent", arguments=dict(goal="relationship", shell_fields=["BMI", "Glucose"], extract_fields=[])),
            dict(name="choose_process", arguments=dict(id="none")),
        ],
        1: [dict(name="choose_shell", arguments=dict(shellId="scatter"))],
        2: [dict(name="fill_shell_params", arguments=dict(x="BMI", y="Glucose"))],
    }
    monkeypatch.setattr("vintent.core.providers.completions_post", mock_completions(mock_replies))
    inputs = build_inputs("Show me the relationship between BMI and Glucose levels")
    result = await run(config_combined, inputs, dataset_path)
    assert_log("Visualizing Scatter Plot.", result)
    assert_output(result["spec"], "test_scatter_bmi_glucose")


@pytest.mark.asyncio
async def test_box_plot_by_obesity(monkeypatch):
    """Test box plot comparing distributions across categories."""
    mock_replies = {
        0: [
            dict(name="parse_intent", arguments=dict(goal="comparison", shell_fields=["Obesity", "Age"], extract_fields=[])),
            dict(name="choose_process", arguments=dict(id="none")),
        ],
        1: [dict(name="choose_shell", arguments=dict(shellId="box_plot"))],
        2: [dict(name="fill_shell_params", arguments=dict(x="Obesity", y="Age"))],
    }
    monkeypatch.setattr("vintent.core.providers.completions_post", mock_completions(mock_replies))
    inputs = build_inputs("Compare age distribution between obese and non-obese patients")
    result = await run(config_combined, inputs, dataset_path)
    assert_log("Visualizing Box Plot.", result)
    assert_output(result["spec"], "test_box_plot_obesity")


@pytest.mark.asyncio
async def test_pie_chart_obesity_breakdown(monkeypatch):
    """Test pie chart for categorical distribution."""
    mock_replies = {
        0: [
            dict(name="parse_intent", arguments=dict(goal="composition", shell_fields=["Obesity"], extract_fields=[])),
            dict(name="choose_process", arguments=dict(id="none")),
        ],
        1: [dict(name="choose_shell", arguments=dict(shellId="pie_chart"))],
        2: [dict(name="fill_shell_params", arguments=dict(category="Obesity"))],
    }
    monkeypatch.setattr("vintent.core.providers.completions_post", mock_completions(mock_replies))
    inputs = build_inputs("Show a pie chart of obesity categories")
    result = await run(config_combined, inputs, dataset_path)
    assert_log("Visualizing Pie Chart.", result)
    assert_output(result["spec"], "test_pie_chart_obesity")


@pytest.mark.asyncio
async def test_bar_aggregate_glucose_by_obesity(monkeypatch):
    """Test bar chart showing aggregated values by category."""
    mock_replies = {
        0: [
            dict(name="parse_intent", arguments=dict(goal="comparison", shell_fields=["Obesity", "Glucose"], extract_fields=[])),
            dict(name="choose_process", arguments=dict(id="none")),
        ],
        1: [dict(name="choose_shell", arguments=dict(shellId="bar_aggregate"))],
        2: [dict(name="fill_shell_params", arguments=dict(group_by="Obesity", metric="Glucose", op="mean"))],
    }
    monkeypatch.setattr("vintent.core.providers.completions_post", mock_completions(mock_replies))
    inputs = build_inputs("What is the average glucose level for each obesity category?")
    result = await run(config_combined, inputs, dataset_path)
    assert_log("Visualizing Bar Chart (Aggregated).", result)
    assert_output(result["spec"], "test_bar_aggregate_glucose")


@pytest.mark.asyncio
async def test_density_bmi(monkeypatch):
    """Test density plot for distribution visualization."""
    mock_replies = {
        0: [
            dict(name="parse_intent", arguments=dict(goal="distribution", shell_fields=["BMI"], extract_fields=[])),
            dict(name="choose_process", arguments=dict(id="none")),
        ],
        1: [dict(name="choose_shell", arguments=dict(shellId="density"))],
        2: [dict(name="fill_shell_params", arguments=dict(x="BMI"))],
    }
    monkeypatch.setattr("vintent.core.providers.completions_post", mock_completions(mock_replies))
    inputs = build_inputs("Show me the distribution of BMI values")
    result = await run(config_combined, inputs, dataset_path)
    assert_log("Visualizing Density Plot.", result)
    assert_output(result["spec"], "test_density_bmi")


@pytest.mark.asyncio
async def test_bubble_chart_three_variables(monkeypatch):
    """Test bubble chart for visualizing three quantitative dimensions."""
    mock_replies = {
        0: [
            dict(name="parse_intent", arguments=dict(goal="relationship", shell_fields=["Age", "Glucose", "BMI"], extract_fields=[])),
            dict(name="choose_process", arguments=dict(id="none")),
        ],
        1: [dict(name="choose_shell", arguments=dict(shellId="bubble_chart"))],
        2: [dict(name="fill_shell_params", arguments=dict(x="Age", y="Glucose", size="BMI"))],
    }
    monkeypatch.setattr("vintent.core.providers.completions_post", mock_completions(mock_replies))
    inputs = build_inputs("Plot age vs glucose with bubble size representing BMI")
    result = await run(config_combined, inputs, dataset_path)
    assert_log("Visualizing Bubble Chart.", result)
    assert_output(result["spec"], "test_bubble_chart")


@pytest.mark.asyncio
async def test_summary_statistics_insulin(monkeypatch):
    """Test summary statistics for a single variable."""
    mock_replies = {
        0: [
            dict(name="parse_intent", arguments=dict(goal="summary", shell_fields=["Insulin"], extract_fields=[])),
            dict(name="choose_process", arguments=dict(id="none")),
        ],
        1: [dict(name="choose_shell", arguments=dict(shellId="summary_statistics"))],
        2: [dict(name="fill_shell_params", arguments=dict(field="Insulin"))],
    }
    monkeypatch.setattr("vintent.core.providers.completions_post", mock_completions(mock_replies))
    inputs = build_inputs("Give me summary statistics for Insulin levels")
    result = await run(config_combined, inputs, dataset_path)
    assert_log("Visualizing Summary Statistics.", result)
    assert_output(result["spec"], "test_summary_statistics_insulin")


@pytest.mark.asyncio
async def test_histogram_with_sampling(monkeypatch):
    """Test histogram with data sampling preprocessing."""
    mock_replies = {
        0: [
            dict(name="parse_intent", arguments=dict(goal="distribution", shell_fields=["BloodPressure"], extract_fields=[])),
            dict(name="choose_process", arguments=dict(id="sample_rows", params=dict(n=100, seed=42))),
        ],
        1: [dict(name="choose_shell", arguments=dict(shellId="histogram"))],
        2: [dict(name="fill_shell_params", arguments=dict(field="BloodPressure"))],
    }
    monkeypatch.setattr("vintent.core.providers.completions_post", mock_completions(mock_replies))
    inputs = build_inputs("Show a histogram of blood pressure for a sample of 100 patients")
    result = await run(config_combined, inputs, dataset_path)
    assert_log("Sampled 100 random rows", result)
    assert_log("Visualizing Histogram.", result)
    assert_output(result["spec"], "test_histogram_sampled")


@pytest.mark.asyncio
async def test_violin_plot_bmi_by_outcome(monkeypatch):
    """Test violin plot comparing distributions by outcome."""
    mock_replies = {
        0: [
            dict(name="parse_intent", arguments=dict(goal="distribution", shell_fields=["Obesity", "BMI"], extract_fields=[])),
            dict(name="choose_process", arguments=dict(id="none")),
        ],
        1: [dict(name="choose_shell", arguments=dict(shellId="violin_plot"))],
        2: [dict(name="fill_shell_params", arguments=dict(x="Obesity", y="BMI"))],
    }
    monkeypatch.setattr("vintent.core.providers.completions_post", mock_completions(mock_replies))
    inputs = build_inputs("Show violin plot of BMI grouped by obesity status")
    result = await run(config_combined, inputs, dataset_path)
    assert_log("Visualizing Violin Plot.", result)
    assert_output(result["spec"], "test_violin_plot_bmi")


@pytest.mark.asyncio
async def test_scatter_with_range_filter(monkeypatch):
    """Test scatter plot with range filtering preprocessing."""
    mock_replies = {
        0: [
            dict(name="parse_intent", arguments=dict(goal="relationship", shell_fields=["Glucose", "Insulin"], extract_fields=["Insulin"])),
            dict(name="choose_process", arguments=dict(id="range_filter", params=dict(field="Insulin", min=10, max=300))),
        ],
        1: [dict(name="choose_shell", arguments=dict(shellId="scatter"))],
        2: [dict(name="fill_shell_params", arguments=dict(x="Glucose", y="Insulin"))],
    }
    monkeypatch.setattr("vintent.core.providers.completions_post", mock_completions(mock_replies))
    inputs = build_inputs("Show glucose vs insulin relationship for insulin between 10 and 300")
    result = await run(config_combined, inputs, dataset_path)
    assert_log("Filter rows where Insulin is between 10 and 300", result)
    assert_log("Visualizing Scatter Plot.", result)
    assert_output(result["spec"], "test_scatter_filtered_range")


# ============================================================================
# Sequential pipeline mode tests (more reliable for local/smaller models)
# ============================================================================
# Sequential mode uses 4 LLM calls with forced tool choice:
# - Call 0: parse_intent (forced)
# - Call 1: choose_process (forced)
# - Call 2: choose_shell (forced)
# - Call 3: fill_shell_params (forced)


@pytest.mark.asyncio
async def test_sequential_histogram(monkeypatch):
    """Test histogram in sequential pipeline mode."""
    mock_replies = {
        0: [dict(name="parse_intent", arguments=dict(goal="distribution", shell_fields=["Age"], extract_fields=["Age"]))],
        1: [dict(name="choose_process", arguments=dict(id="range_filter", params=dict(field="Age", min=50)))],
        2: [dict(name="choose_shell", arguments=dict(shellId="histogram"))],
        3: [dict(name="fill_shell_params", arguments=dict(field="Age"))],
    }
    monkeypatch.setattr("vintent.core.providers.completions_post", mock_completions(mock_replies))
    inputs = build_inputs("Create a histogram of age with age > 50")
    result = await run(config_sequential, inputs, dataset_path)
    assert_log("Filter rows where Age is >= 50.", result)
    assert_log("Visualizing Histogram.", result)
    assert_log("Computed histogram bins", result)
    assert_output(result["spec"], "test_histogram")


@pytest.mark.asyncio
async def test_sequential_scatter_no_filter(monkeypatch):
    """Test scatter plot in sequential mode without extraction."""
    mock_replies = {
        0: [dict(name="parse_intent", arguments=dict(goal="relationship", shell_fields=["BMI", "Glucose"], extract_fields=[]))],
        1: [dict(name="choose_process", arguments=dict(id="none"))],
        2: [dict(name="choose_shell", arguments=dict(shellId="scatter"))],
        3: [dict(name="fill_shell_params", arguments=dict(x="BMI", y="Glucose"))],
    }
    monkeypatch.setattr("vintent.core.providers.completions_post", mock_completions(mock_replies))
    inputs = build_inputs("Show me the relationship between BMI and Glucose levels")
    result = await run(config_sequential, inputs, dataset_path)
    assert_log("Visualizing Scatter Plot.", result)
    assert_output(result["spec"], "test_scatter_bmi_glucose")


@pytest.mark.asyncio
async def test_sequential_scatter_with_filter(monkeypatch):
    """Test scatter plot in sequential mode with range filtering."""
    mock_replies = {
        0: [dict(name="parse_intent", arguments=dict(goal="relationship", shell_fields=["Glucose", "Insulin"], extract_fields=["Insulin"]))],
        1: [dict(name="choose_process", arguments=dict(id="range_filter", params=dict(field="Insulin", min=10, max=300)))],
        2: [dict(name="choose_shell", arguments=dict(shellId="scatter"))],
        3: [dict(name="fill_shell_params", arguments=dict(x="Glucose", y="Insulin"))],
    }
    monkeypatch.setattr("vintent.core.providers.completions_post", mock_completions(mock_replies))
    inputs = build_inputs("Show glucose vs insulin relationship for insulin between 10 and 300")
    result = await run(config_sequential, inputs, dataset_path)
    assert_log("Filter rows where Insulin is between 10 and 300", result)
    assert_log("Visualizing Scatter Plot.", result)
    assert_output(result["spec"], "test_scatter_filtered_range")


@pytest.mark.asyncio
async def test_sequential_pie_chart(monkeypatch):
    """Test pie chart in sequential mode."""
    mock_replies = {
        0: [dict(name="parse_intent", arguments=dict(goal="composition", shell_fields=["Obesity"], extract_fields=[]))],
        1: [dict(name="choose_process", arguments=dict(id="none"))],
        2: [dict(name="choose_shell", arguments=dict(shellId="pie_chart"))],
        3: [dict(name="fill_shell_params", arguments=dict(category="Obesity"))],
    }
    monkeypatch.setattr("vintent.core.providers.completions_post", mock_completions(mock_replies))
    inputs = build_inputs("Show a pie chart of obesity categories")
    result = await run(config_sequential, inputs, dataset_path)
    assert_log("Visualizing Pie Chart.", result)
    assert_output(result["spec"], "test_pie_chart_obesity")
