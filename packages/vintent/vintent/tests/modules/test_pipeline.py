"""Tests for the pipeline module."""

import json
import os
import tempfile
from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock

import pytest

from vintent.core.exceptions import DataError, AppError
from vintent.modules.shells.base import ShellError
from vintent.modules.pipeline import (
    AnalyzePhase,
    ChooseShellPhase,
    CompilePhase,
    CompletionsProvider,
    ExtractPhase,
    FillParamsPhase,
    LoadDataPhase,
    Phase,
    Pipeline,
    PipelineContext,
    ValidatePhase,
    create_default_pipeline,
)
from vintent.modules.profiler import profile_rows
from vintent.modules.schemas import CompletionsReply


# =============================================================================
# Mock Completions Provider
# =============================================================================


class MockCompletionsProvider(CompletionsProvider):
    """Mock provider that returns predefined responses."""

    def __init__(self, responses: Optional[List[Optional[Dict]]] = None):
        self.responses = responses or []
        self.call_count = 0
        self.calls: List[Dict] = []

    async def complete(
        self,
        transcripts: List[Dict],
        tools: List[Dict[str, Any]],
    ) -> Optional[CompletionsReply]:
        self.calls.append({"transcripts": transcripts, "tools": tools})
        if self.call_count < len(self.responses):
            response = self.responses[self.call_count]
            self.call_count += 1
            return response
        self.call_count += 1
        return None


def make_tool_response(tool_name: str, arguments: Dict[str, Any]) -> Dict:
    """Create a mock LLM response with a tool call."""
    return {
        "choices": [
            {
                "message": {
                    "tool_calls": [
                        {
                            "function": {
                                "name": tool_name,
                                "arguments": json.dumps(arguments),
                            }
                        }
                    ]
                }
            }
        ]
    }


# =============================================================================
# Test Fixtures
# =============================================================================


@pytest.fixture
def sample_csv_content():
    return "name,age,score\nAlice,30,85.5\nBob,25,90.0\nCharlie,35,78.5"


@pytest.fixture
def sample_transcripts():
    return [
        {"role": "system", "content": "You are a visualization assistant."},
        {"role": "user", "content": "Show me a scatter plot of age vs score"},
    ]


@pytest.fixture
def sample_profile():
    rows = [
        {"name": "Alice", "age": 30, "score": 85.5},
        {"name": "Bob", "age": 25, "score": 90.0},
        {"name": "Charlie", "age": 35, "score": 78.5},
    ]
    return profile_rows(rows)


@pytest.fixture
def sample_values():
    return [
        {"name": "Alice", "age": 30, "score": 85.5},
        {"name": "Bob", "age": 25, "score": 90.0},
        {"name": "Charlie", "age": 35, "score": 78.5},
    ]


# =============================================================================
# PipelineContext Tests
# =============================================================================


class TestPipelineContext:
    def test_initialization_with_required_fields(self, sample_transcripts):
        ctx = PipelineContext(
            transcripts=sample_transcripts,
            file_name="/path/to/file.csv",
        )
        assert ctx.transcripts == sample_transcripts
        assert ctx.file_name == "/path/to/file.csv"
        assert ctx.values == []
        assert ctx.profile is None
        assert ctx.shell is None
        assert ctx.shell_id is None
        assert ctx.params == {}
        assert ctx.logs == []
        assert ctx.widgets == []
        assert ctx.errors == []
        assert ctx.should_continue is True

    def test_stop_sets_should_continue_false(self, sample_transcripts):
        ctx = PipelineContext(transcripts=sample_transcripts, file_name="test.csv")
        ctx.stop()
        assert ctx.should_continue is False

    def test_stop_with_log_message(self, sample_transcripts):
        ctx = PipelineContext(transcripts=sample_transcripts, file_name="test.csv")
        ctx.stop("Pipeline stopped early")
        assert ctx.should_continue is False
        assert "Pipeline stopped early" in ctx.logs

    def test_add_error_stops_pipeline(self, sample_transcripts):
        ctx = PipelineContext(transcripts=sample_transcripts, file_name="test.csv")
        error = DataError("Test error", details={"key": "value"})
        ctx.add_error(error)
        assert ctx.should_continue is False
        assert len(ctx.errors) == 1
        assert ctx.errors[0]["code"] == "DATA_ERROR"
        assert ctx.errors[0]["message"] == "Test error"
        assert "Error: Test error" in ctx.logs

    def test_to_result_returns_correct_structure(self, sample_transcripts):
        ctx = PipelineContext(transcripts=sample_transcripts, file_name="test.csv")
        ctx.logs.append("Log message")
        ctx.widgets.append({"type": "vega-lite"})
        ctx.errors.append({"code": "ERROR", "message": "Error"})

        result = ctx.to_result()

        assert result == {
            "logs": ["Log message"],
            "widgets": [{"type": "vega-lite"}],
            "errors": [{"code": "ERROR", "message": "Error"}],
        }


# =============================================================================
# LoadDataPhase Tests
# =============================================================================


class TestLoadDataPhase:
    @pytest.mark.asyncio
    async def test_loads_csv_and_profiles(self, sample_csv_content, sample_transcripts):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as f:
            f.write(sample_csv_content)
            temp_path = f.name

        try:
            ctx = PipelineContext(transcripts=sample_transcripts, file_name=temp_path)
            phase = LoadDataPhase()
            provider = MockCompletionsProvider()

            await phase.run(ctx, provider)

            assert len(ctx.values) == 3
            assert ctx.profile is not None
            assert ctx.profile["row_count"] == 3
            assert "name" in ctx.profile["fields"]
            assert "age" in ctx.profile["fields"]
            assert "score" in ctx.profile["fields"]
            assert ctx.should_continue is True
        finally:
            os.unlink(temp_path)

    @pytest.mark.asyncio
    async def test_file_not_found_adds_error(self, sample_transcripts):
        ctx = PipelineContext(
            transcripts=sample_transcripts,
            file_name="/nonexistent/path/file.csv",
        )
        phase = LoadDataPhase()
        provider = MockCompletionsProvider()

        await phase.run(ctx, provider)

        assert ctx.should_continue is False
        assert len(ctx.errors) == 1
        assert ctx.errors[0]["code"] == "DATA_ERROR"
        assert "not found" in ctx.errors[0]["message"]

    @pytest.mark.asyncio
    async def test_phase_name(self):
        phase = LoadDataPhase()
        assert phase.name == "load_data"


# =============================================================================
# ExtractPhase Tests
# =============================================================================


class TestExtractPhase:
    @pytest.mark.asyncio
    async def test_skips_when_no_profile(self, sample_transcripts):
        ctx = PipelineContext(transcripts=sample_transcripts, file_name="test.csv")
        phase = ExtractPhase()
        provider = MockCompletionsProvider()

        await phase.run(ctx, provider)

        assert ctx.should_continue is True
        assert provider.call_count == 0

    @pytest.mark.asyncio
    async def test_skips_when_no_process_selected(
        self, sample_transcripts, sample_profile, sample_values
    ):
        ctx = PipelineContext(transcripts=sample_transcripts, file_name="test.csv")
        ctx.profile = sample_profile
        ctx.values = sample_values

        response = make_tool_response("choose_process", {"id": "none"})
        provider = MockCompletionsProvider([response])
        phase = ExtractPhase()

        await phase.run(ctx, provider)

        assert ctx.should_continue is True
        assert len(ctx.values) == 3  # Values unchanged

    @pytest.mark.asyncio
    async def test_applies_range_filter(self, sample_transcripts):
        ctx = PipelineContext(transcripts=sample_transcripts, file_name="test.csv")
        ctx.values = [
            {"name": "Alice", "age": 30, "score": 85.5},
            {"name": "Bob", "age": 25, "score": 90.0},
            {"name": "Charlie", "age": 35, "score": 78.5},
        ]
        ctx.profile = profile_rows(ctx.values)

        response = make_tool_response(
            "choose_process",
            {"id": "range_filter", "params": {"field": "age", "min": 28, "max": 40}},
        )
        provider = MockCompletionsProvider([response])
        phase = ExtractPhase()

        await phase.run(ctx, provider)

        assert len(ctx.values) == 2  # Alice and Charlie (age 30 and 35)
        assert ctx.profile["row_count"] == 2
        assert any("Filter" in log for log in ctx.logs)

    @pytest.mark.asyncio
    async def test_phase_name(self):
        phase = ExtractPhase()
        assert phase.name == "extract"


# =============================================================================
# ChooseShellPhase Tests
# =============================================================================


class TestChooseShellPhase:
    @pytest.mark.asyncio
    async def test_stops_when_no_profile(self, sample_transcripts):
        ctx = PipelineContext(transcripts=sample_transcripts, file_name="test.csv")
        phase = ChooseShellPhase()
        provider = MockCompletionsProvider()

        await phase.run(ctx, provider)

        assert ctx.should_continue is False
        assert "No data profile available." in ctx.logs

    @pytest.mark.asyncio
    async def test_stops_when_no_reply(self, sample_transcripts, sample_profile):
        ctx = PipelineContext(transcripts=sample_transcripts, file_name="test.csv")
        ctx.profile = sample_profile
        phase = ChooseShellPhase()
        provider = MockCompletionsProvider([None])

        await phase.run(ctx, provider)

        assert ctx.should_continue is False
        assert "No visualization could be selected." in ctx.logs

    @pytest.mark.asyncio
    async def test_adds_error_when_no_shell_id(self, sample_transcripts, sample_profile):
        ctx = PipelineContext(transcripts=sample_transcripts, file_name="test.csv")
        ctx.profile = sample_profile
        response = make_tool_response("choose_shell", {})
        provider = MockCompletionsProvider([response])
        phase = ChooseShellPhase()

        await phase.run(ctx, provider)

        assert ctx.should_continue is False
        assert len(ctx.errors) == 1
        assert ctx.errors[0]["code"] == "SHELL_ERROR"

    @pytest.mark.asyncio
    async def test_adds_error_for_unknown_shell(self, sample_transcripts, sample_profile):
        ctx = PipelineContext(transcripts=sample_transcripts, file_name="test.csv")
        ctx.profile = sample_profile
        response = make_tool_response("choose_shell", {"shellId": "nonexistent_shell"})
        provider = MockCompletionsProvider([response])
        phase = ChooseShellPhase()

        await phase.run(ctx, provider)

        assert ctx.should_continue is False
        assert len(ctx.errors) == 1
        assert "nonexistent_shell" in ctx.errors[0]["details"]["shell_id"]

    @pytest.mark.asyncio
    async def test_selects_valid_shell(self, sample_transcripts, sample_profile):
        ctx = PipelineContext(transcripts=sample_transcripts, file_name="test.csv")
        ctx.profile = sample_profile
        response = make_tool_response("choose_shell", {"shellId": "scatter"})
        provider = MockCompletionsProvider([response])
        phase = ChooseShellPhase()

        await phase.run(ctx, provider)

        assert ctx.should_continue is True
        assert ctx.shell_id == "scatter"
        assert ctx.shell is not None
        assert "Visualizing Scatter Plot." in ctx.logs

    @pytest.mark.asyncio
    async def test_phase_name(self):
        phase = ChooseShellPhase()
        assert phase.name == "choose_shell"


# =============================================================================
# FillParamsPhase Tests
# =============================================================================


class TestFillParamsPhase:
    @pytest.mark.asyncio
    async def test_skips_when_no_shell(self, sample_transcripts, sample_profile):
        ctx = PipelineContext(transcripts=sample_transcripts, file_name="test.csv")
        ctx.profile = sample_profile
        phase = FillParamsPhase()
        provider = MockCompletionsProvider()

        await phase.run(ctx, provider)

        assert ctx.should_continue is True
        assert ctx.params == {}

    @pytest.mark.asyncio
    async def test_fills_params_from_response(self, sample_transcripts, sample_profile):
        from vintent.modules.registry import SHELLS

        ctx = PipelineContext(transcripts=sample_transcripts, file_name="test.csv")
        ctx.profile = sample_profile
        ctx.shell = SHELLS.get("scatter")
        ctx.shell_id = "scatter"

        response = make_tool_response(
            "fill_shell_params", {"x": "age", "y": "score"}
        )
        provider = MockCompletionsProvider([response])
        phase = FillParamsPhase()

        await phase.run(ctx, provider)

        assert ctx.params["x"] == "age"
        assert ctx.params["y"] == "score"

    @pytest.mark.asyncio
    async def test_handles_no_response(self, sample_transcripts, sample_profile):
        from vintent.modules.registry import SHELLS

        ctx = PipelineContext(transcripts=sample_transcripts, file_name="test.csv")
        ctx.profile = sample_profile
        ctx.shell = SHELLS.get("scatter")
        ctx.shell_id = "scatter"

        provider = MockCompletionsProvider([None])
        phase = FillParamsPhase()

        await phase.run(ctx, provider)

        assert ctx.should_continue is True
        assert ctx.params == {}

    @pytest.mark.asyncio
    async def test_phase_name(self):
        phase = FillParamsPhase()
        assert phase.name == "fill_params"


# =============================================================================
# AnalyzePhase Tests
# =============================================================================


class TestAnalyzePhase:
    @pytest.mark.asyncio
    async def test_skips_when_no_shell(self, sample_transcripts, sample_profile):
        ctx = PipelineContext(transcripts=sample_transcripts, file_name="test.csv")
        ctx.profile = sample_profile
        phase = AnalyzePhase()
        provider = MockCompletionsProvider()

        await phase.run(ctx, provider)

        assert ctx.should_continue is True

    @pytest.mark.asyncio
    async def test_skips_when_shell_has_no_processes(
        self, sample_transcripts, sample_profile, sample_values
    ):
        from vintent.modules.registry import SHELLS

        ctx = PipelineContext(transcripts=sample_transcripts, file_name="test.csv")
        ctx.profile = sample_profile
        ctx.values = sample_values
        ctx.shell = SHELLS.get("scatter")  # Scatter has no processes
        ctx.shell_id = "scatter"

        phase = AnalyzePhase()
        provider = MockCompletionsProvider()

        await phase.run(ctx, provider)

        assert ctx.should_continue is True
        assert len(ctx.values) == 3  # Values unchanged

    @pytest.mark.asyncio
    async def test_runs_shell_processes(self, sample_transcripts):
        from vintent.modules.registry import SHELLS

        ctx = PipelineContext(transcripts=sample_transcripts, file_name="test.csv")
        ctx.values = [
            {"x": 1, "y": 10},
            {"x": 2, "y": 20},
            {"x": 3, "y": 30},
            {"x": 4, "y": 40},
            {"x": 5, "y": 50},
        ]
        ctx.profile = profile_rows(ctx.values)
        ctx.shell = SHELLS.get("histogram")
        ctx.shell_id = "histogram"
        ctx.params = {"field": "x"}

        phase = AnalyzePhase()
        provider = MockCompletionsProvider()

        await phase.run(ctx, provider)

        # Histogram creates bins
        assert ctx.should_continue is True
        assert any("histogram" in log.lower() or "bin" in log.lower() for log in ctx.logs)

    @pytest.mark.asyncio
    async def test_phase_name(self):
        phase = AnalyzePhase()
        assert phase.name == "analyze"


# =============================================================================
# ValidatePhase Tests
# =============================================================================


class TestValidatePhase:
    @pytest.mark.asyncio
    async def test_skips_when_no_shell(self, sample_transcripts, sample_profile):
        ctx = PipelineContext(transcripts=sample_transcripts, file_name="test.csv")
        ctx.profile = sample_profile
        phase = ValidatePhase()
        provider = MockCompletionsProvider()

        await phase.run(ctx, provider)

        assert ctx.should_continue is True

    @pytest.mark.asyncio
    async def test_passes_with_valid_params(self, sample_transcripts, sample_profile):
        from vintent.modules.registry import SHELLS

        ctx = PipelineContext(transcripts=sample_transcripts, file_name="test.csv")
        ctx.profile = sample_profile
        ctx.shell = SHELLS.get("scatter")
        ctx.shell_id = "scatter"
        ctx.params = {"x": "age", "y": "score"}

        phase = ValidatePhase()
        provider = MockCompletionsProvider()

        await phase.run(ctx, provider)

        assert ctx.should_continue is True
        assert len(ctx.errors) == 0

    @pytest.mark.asyncio
    async def test_phase_name(self):
        phase = ValidatePhase()
        assert phase.name == "validate"


# =============================================================================
# CompilePhase Tests
# =============================================================================


class TestCompilePhase:
    @pytest.mark.asyncio
    async def test_skips_when_no_shell(self, sample_transcripts):
        ctx = PipelineContext(transcripts=sample_transcripts, file_name="test.csv")
        phase = CompilePhase()
        provider = MockCompletionsProvider()

        await phase.run(ctx, provider)

        assert ctx.widgets == []

    @pytest.mark.asyncio
    async def test_compiles_vega_lite_spec(self, sample_transcripts, sample_values):
        from vintent.modules.registry import SHELLS

        ctx = PipelineContext(transcripts=sample_transcripts, file_name="test.csv")
        ctx.values = sample_values
        ctx.profile = profile_rows(sample_values)
        ctx.shell = SHELLS.get("scatter")
        ctx.shell_id = "scatter"
        ctx.params = {"x": "age", "y": "score"}

        phase = CompilePhase()
        provider = MockCompletionsProvider()

        await phase.run(ctx, provider)

        assert len(ctx.widgets) == 1
        spec = ctx.widgets[0]
        assert "$schema" in spec
        assert "data" in spec
        assert "mark" in spec

    @pytest.mark.asyncio
    async def test_sanitizes_non_finite_values(self, sample_transcripts):
        from vintent.modules.registry import SHELLS
        import math

        ctx = PipelineContext(transcripts=sample_transcripts, file_name="test.csv")
        ctx.values = [
            {"x": 1, "y": float("inf")},
            {"x": 2, "y": float("-inf")},
            {"x": 3, "y": float("nan")},
            {"x": 4, "y": 10.0},
        ]
        ctx.profile = profile_rows([{"x": 1, "y": 10}, {"x": 2, "y": 20}])
        ctx.shell = SHELLS.get("scatter")
        ctx.shell_id = "scatter"
        ctx.params = {"x": "x", "y": "y"}

        phase = CompilePhase()
        provider = MockCompletionsProvider()

        await phase.run(ctx, provider)

        assert len(ctx.widgets) == 1
        data_values = ctx.widgets[0]["data"]["values"]
        # Non-finite values should be replaced with None
        assert data_values[0]["y"] is None
        assert data_values[1]["y"] is None
        assert data_values[2]["y"] is None
        assert data_values[3]["y"] == 10.0

    @pytest.mark.asyncio
    async def test_phase_name(self):
        phase = CompilePhase()
        assert phase.name == "compile"


# =============================================================================
# Pipeline Tests
# =============================================================================


class TestPipeline:
    @pytest.mark.asyncio
    async def test_runs_all_phases_in_order(self, sample_transcripts):
        execution_order = []

        class TrackingPhase(Phase):
            def __init__(self, name: str):
                self._name = name

            @property
            def name(self) -> str:
                return self._name

            async def run(self, ctx: PipelineContext, provider: CompletionsProvider):
                execution_order.append(self._name)

        phases = [
            TrackingPhase("phase1"),
            TrackingPhase("phase2"),
            TrackingPhase("phase3"),
        ]
        pipeline = Pipeline(phases)
        ctx = PipelineContext(transcripts=sample_transcripts, file_name="test.csv")
        provider = MockCompletionsProvider()

        await pipeline.run(ctx, provider)

        assert execution_order == ["phase1", "phase2", "phase3"]

    @pytest.mark.asyncio
    async def test_stops_on_should_continue_false(self, sample_transcripts):
        execution_order = []

        class StoppingPhase(Phase):
            @property
            def name(self) -> str:
                return "stopping"

            async def run(self, ctx: PipelineContext, provider: CompletionsProvider):
                execution_order.append("stopping")
                ctx.stop("Stopped early")

        class NeverReachedPhase(Phase):
            @property
            def name(self) -> str:
                return "never_reached"

            async def run(self, ctx: PipelineContext, provider: CompletionsProvider):
                execution_order.append("never_reached")

        pipeline = Pipeline([StoppingPhase(), NeverReachedPhase()])
        ctx = PipelineContext(transcripts=sample_transcripts, file_name="test.csv")
        provider = MockCompletionsProvider()

        await pipeline.run(ctx, provider)

        assert execution_order == ["stopping"]
        assert ctx.should_continue is False

    @pytest.mark.asyncio
    async def test_catches_vintent_errors(self, sample_transcripts):
        class ErrorPhase(Phase):
            @property
            def name(self) -> str:
                return "error_phase"

            async def run(self, ctx: PipelineContext, provider: CompletionsProvider):
                raise ShellError("Test shell error", details={"test": True})

        pipeline = Pipeline([ErrorPhase()])
        ctx = PipelineContext(transcripts=sample_transcripts, file_name="test.csv")
        provider = MockCompletionsProvider()

        await pipeline.run(ctx, provider)

        assert ctx.should_continue is False
        assert len(ctx.errors) == 1
        assert ctx.errors[0]["code"] == "SHELL_ERROR"

    @pytest.mark.asyncio
    async def test_catches_unexpected_errors(self, sample_transcripts):
        class UnexpectedErrorPhase(Phase):
            @property
            def name(self) -> str:
                return "unexpected"

            async def run(self, ctx: PipelineContext, provider: CompletionsProvider):
                raise ValueError("Something went wrong")

        pipeline = Pipeline([UnexpectedErrorPhase()])
        ctx = PipelineContext(transcripts=sample_transcripts, file_name="test.csv")
        provider = MockCompletionsProvider()

        await pipeline.run(ctx, provider)

        assert ctx.should_continue is False
        assert len(ctx.errors) == 1
        assert ctx.errors[0]["code"] == "UNEXPECTED_ERROR"
        assert ctx.errors[0]["details"]["phase"] == "unexpected"
        assert "unexpected error" in ctx.logs[0].lower()

    @pytest.mark.asyncio
    async def test_returns_context(self, sample_transcripts):
        pipeline = Pipeline([])
        ctx = PipelineContext(transcripts=sample_transcripts, file_name="test.csv")
        provider = MockCompletionsProvider()

        result = await pipeline.run(ctx, provider)

        assert result is ctx


class TestCreateDefaultPipeline:
    def test_creates_pipeline_with_all_phases(self):
        pipeline = create_default_pipeline()

        assert len(pipeline.phases) == 7
        assert isinstance(pipeline.phases[0], LoadDataPhase)
        assert isinstance(pipeline.phases[1], ExtractPhase)
        assert isinstance(pipeline.phases[2], ChooseShellPhase)
        assert isinstance(pipeline.phases[3], FillParamsPhase)
        assert isinstance(pipeline.phases[4], AnalyzePhase)
        assert isinstance(pipeline.phases[5], ValidatePhase)
        assert isinstance(pipeline.phases[6], CompilePhase)

    def test_phase_names_are_unique(self):
        pipeline = create_default_pipeline()
        names = [p.name for p in pipeline.phases]
        assert len(names) == len(set(names))
