"""Pipeline orchestration for visualization generation.

This module provides a composable pipeline architecture that breaks down
the visualization generation process into discrete, testable phases.
"""

from __future__ import annotations

import logging
import math
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from vintent.core.completions import get_tool_call
from vintent.core.exceptions import AppError, DataError
from vintent.core.providers import (
    CompletionsProvider,
    DefaultCompletionsProvider,
    RateLimitedCompletionsProvider,
)
from vintent.modules.shells.base import ShellError

from .process import run_process
from .profiler import DatasetProfile, profile_rows, rows_from_csv
from .registry import PROCESSES, SHELLS
from .schemas import TranscriptMessageType
from .tools import (
    NO_PROCESS_ID,
    build_choose_process_tool,
    build_choose_shell_tool,
    build_fill_shell_params_tool,
    build_parse_intent_tool,
)

if TYPE_CHECKING:
    from .shells.base import BaseShell

logger = logging.getLogger(__name__)


@dataclass
class PipelineContext:
    """Shared state across pipeline phases.

    This dataclass holds all the mutable state that phases need to read
    and modify as data flows through the pipeline.
    """

    # Input
    transcripts: List[TranscriptMessageType]
    file_name: str

    # Data state (mutated by phases)
    values: List[Dict[str, Any]] = field(default_factory=list)
    profile: Optional[DatasetProfile] = None

    # Intent parsing state
    parsed_intent: Optional[Dict[str, Any]] = None

    # Shell state
    shell: Optional[BaseShell] = None
    shell_id: Optional[str] = None
    params: Dict[str, Any] = field(default_factory=dict)

    # Output accumulators
    logs: List[str] = field(default_factory=list)
    spec: Optional[Any] = None
    errors: List[Dict[str, Any]] = field(default_factory=list)

    # Control flow
    should_continue: bool = True

    def stop(self, log_message: Optional[str] = None) -> None:
        """Signal that the pipeline should stop after this phase."""
        self.should_continue = False
        if log_message:
            self.logs.append(log_message)

    def add_error(self, error: AppError) -> None:
        """Add an error and stop the pipeline."""
        self.errors.append(error.to_dict())
        self.logs.append(f"Error: {error.message}")
        self.should_continue = False

    def to_result(self) -> Dict[str, Any]:
        """Convert context to the final result dict."""
        return dict(
            logs=self.logs,
            spec=self.spec,
            errors=self.errors,
        )


class Phase(ABC):
    """Base class for pipeline phases.

    Each phase performs a discrete step in the visualization pipeline.
    Phases can modify the PipelineContext and signal whether the pipeline
    should continue or stop.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable name for logging."""
        ...

    @abstractmethod
    async def run(
        self,
        ctx: PipelineContext,
        provider: CompletionsProvider,
    ) -> None:
        """Execute the phase, modifying ctx as needed.

        To stop the pipeline, call ctx.stop() or ctx.add_error().
        """
        ...


class LoadDataPhase(Phase):
    """Phase 0: Load and profile the input CSV data."""

    @property
    def name(self) -> str:
        return "load_data"

    async def run(
        self,
        ctx: PipelineContext,
        provider: CompletionsProvider,
    ) -> None:
        try:
            with open(ctx.file_name) as f:
                csv_text = f.read()
        except FileNotFoundError:
            ctx.add_error(
                DataError(
                    f"Dataset file not found: {ctx.file_name}",
                    details={"file_name": ctx.file_name},
                )
            )
            return
        except IOError as e:
            ctx.add_error(
                DataError(
                    f"Failed to read dataset: {e}",
                    details={"file_name": ctx.file_name, "io_error": str(e)},
                )
            )
            return

        ctx.values = rows_from_csv(csv_text)
        ctx.profile = profile_rows(ctx.values)
        logger.debug(f"Loaded {len(ctx.values)} rows, profile: {ctx.profile}")


class ParseIntentPhase(Phase):
    """Phase 1: Parse user intent to distinguish visualization vs filter fields.

    This phase uses the LLM to extract structured intent information that helps
    downstream phases (especially FillParams) make better field selections.
    """

    @property
    def name(self) -> str:
        return "parse_intent"

    async def run(
        self,
        ctx: PipelineContext,
        provider: CompletionsProvider,
    ) -> None:
        if not ctx.profile:
            # No profile yet - skip gracefully (don't block pipeline)
            logger.debug("ParseIntentPhase: No profile available, skipping")
            return

        tool = build_parse_intent_tool(ctx.profile)
        if not tool:
            logger.debug("ParseIntentPhase: Could not build tool, skipping")
            return

        try:
            reply = await provider.complete(ctx.transcripts, [tool])

            if not reply:
                logger.debug("ParseIntentPhase: No LLM reply, continuing without intent")
                return

            parsed = get_tool_call("parse_intent", reply)
            if parsed:
                ctx.parsed_intent = parsed
                logger.debug(f"ParseIntentPhase: Parsed intent: {parsed}")
            else:
                logger.debug("ParseIntentPhase: No parse_intent tool call found")

        except Exception as e:
            # Graceful degradation - log but don't block the pipeline
            logger.warning(f"ParseIntentPhase: Failed to parse intent: {e}")
            # Don't call ctx.add_error() - let pipeline continue


class ExtractPhase(Phase):
    """Phase 1: Apply user-requested extraction/filtering."""

    @property
    def name(self) -> str:
        return "extract"

    async def run(
        self,
        ctx: PipelineContext,
        provider: CompletionsProvider,
    ) -> None:
        if not ctx.profile:
            return

        tool = build_choose_process_tool(PROCESSES.EXTRACT, ctx.profile, context=ctx.transcripts)
        reply = await provider.complete(ctx.transcripts, [tool])

        if not reply:
            return

        chosen = get_tool_call("choose_process", reply)
        if not chosen:
            return

        logger.debug(f"choose_process_tool: {chosen}")
        process_id = chosen.get("id")
        if not process_id or process_id == NO_PROCESS_ID:
            return

        process = PROCESSES.EXTRACT.get(process_id)
        if not process:
            return

        params = chosen.get("params", {})
        ctx.values = run_process(process, ctx.values, params)
        ctx.profile = profile_rows(ctx.values)

        if "log" in process:
            ctx.logs.append(process["log"](params))


class ChooseShellPhase(Phase):
    """Phase 2: Select the appropriate visualization shell."""

    @property
    def name(self) -> str:
        return "choose_shell"

    async def run(
        self,
        ctx: PipelineContext,
        provider: CompletionsProvider,
    ) -> None:
        if not ctx.profile:
            ctx.stop("No data profile available.")
            return

        # Pass parsed_intent so shell selection can prioritize goal-matching shells
        tool = build_choose_shell_tool(ctx.profile, ctx.parsed_intent)
        reply = await provider.complete(ctx.transcripts, [tool])

        if not reply:
            ctx.stop("No visualization could be selected.")
            return

        chosen = get_tool_call("choose_shell", reply)
        if not chosen or not chosen.get("shellId"):
            ctx.add_error(
                ShellError(
                    "No compatible visualization shell available.",
                    details={"profile_fields": list(ctx.profile.get("fields", {}).keys())},
                )
            )
            return

        shell_id = chosen["shellId"]
        shell = SHELLS.get(shell_id)
        if not shell:
            ctx.add_error(
                ShellError(
                    f"Unknown shell selected: {shell_id}",
                    details={"shell_id": shell_id},
                )
            )
            return

        ctx.shell_id = shell_id
        ctx.shell = shell
        ctx.logs.append(f"Visualizing {shell.name}.")
        logger.debug(f"choose_shell_tool: {shell_id}")


class CombinedDecisionPhase(Phase):
    """Hybrid phase for intent parsing, extraction, and shell selection.

    Uses a hybrid approach to balance latency and reliability:
    - Call 1: parse_intent + choose_process (parallel, optional)
    - Call 2: choose_shell (forced, required)

    This reduces total LLM calls from 4 to 3 while keeping shell selection
    reliable through forced tool choice.

    Combines:
    - ParseIntentPhase: Extract visualization vs filter field intent
    - ExtractPhase: Apply data filtering/extraction
    - ChooseShellPhase: Select visualization type
    """

    @property
    def name(self) -> str:
        return "combined_decision"

    async def run(
        self,
        ctx: PipelineContext,
        provider: CompletionsProvider,
    ) -> None:
        if not ctx.profile:
            ctx.stop("No data profile available.")
            return

        # --- Call 1: Optional tools (parse_intent + choose_process) ---
        # These are optional and can fail gracefully
        optional_tools: List[Dict[str, Any]] = []

        intent_tool = build_parse_intent_tool(ctx.profile)
        if intent_tool:
            optional_tools.append(intent_tool)

        process_tool = build_choose_process_tool(
            PROCESSES.EXTRACT, ctx.profile, context=ctx.transcripts
        )
        optional_tools.append(process_tool)

        if optional_tools:
            # Use parallel_tools=True to allow LLM to call multiple tools
            optional_reply = await provider.complete(
                ctx.transcripts, optional_tools, parallel_tools=True
            )

            if optional_reply:
                # Extract parse_intent result (optional, for better field selection)
                parsed_intent = get_tool_call("parse_intent", optional_reply)
                if parsed_intent:
                    ctx.parsed_intent = parsed_intent
                    logger.debug(f"CombinedDecisionPhase: Parsed intent: {parsed_intent}")

                # Extract and apply extraction process (optional)
                process_choice = get_tool_call("choose_process", optional_reply)
                if process_choice:
                    logger.debug(f"CombinedDecisionPhase: Process choice: {process_choice}")
                    process_id = process_choice.get("id")
                    if process_id and process_id != NO_PROCESS_ID:
                        process = PROCESSES.EXTRACT.get(process_id)
                        if process:
                            params = process_choice.get("params", {})
                            ctx.values = run_process(process, ctx.values, params)
                            ctx.profile = profile_rows(ctx.values)
                            if "log" in process:
                                ctx.logs.append(process["log"](params))

        # --- Call 2: Required tool (choose_shell) ---
        # This uses forced tool choice for reliability
        # Pass parsed_intent so shell selection can prioritize goal-matching shells
        shell_tool = build_choose_shell_tool(ctx.profile, ctx.parsed_intent)
        shell_reply = await provider.complete(ctx.transcripts, [shell_tool])

        if not shell_reply:
            ctx.stop("No visualization could be selected.")
            return

        shell_choice = get_tool_call("choose_shell", shell_reply)
        if not shell_choice or not shell_choice.get("shellId"):
            ctx.add_error(
                ShellError(
                    "No compatible visualization shell available.",
                    details={"profile_fields": list(ctx.profile.get("fields", {}).keys())},
                )
            )
            return

        shell_id = shell_choice["shellId"]
        shell = SHELLS.get(shell_id)
        if not shell:
            ctx.add_error(
                ShellError(
                    f"Unknown shell selected: {shell_id}",
                    details={"shell_id": shell_id},
                )
            )
            return

        ctx.shell_id = shell_id
        ctx.shell = shell
        ctx.logs.append(f"Visualizing {shell.name}.")
        logger.debug(f"CombinedDecisionPhase: Selected shell: {shell_id}")


class FillParamsPhase(Phase):
    """Phase 3: Fill visualization parameters via LLM."""

    @property
    def name(self) -> str:
        return "fill_params"

    async def run(
        self,
        ctx: PipelineContext,
        provider: CompletionsProvider,
    ) -> None:
        if not ctx.shell or not ctx.profile:
            return

        fill_tool = build_fill_shell_params_tool(ctx.shell, ctx.profile, parsed_intent=ctx.parsed_intent)
        if not fill_tool:
            return

        reply = await provider.complete(ctx.transcripts, [fill_tool])
        if not reply:
            return

        filled = get_tool_call("fill_shell_params", reply)
        if filled:
            ctx.params.update(filled)
            logger.debug(f"fill_shell_params_tool: {ctx.params}")


class AnalyzePhase(Phase):
    """Phase 4: Run shell-specific analysis processes."""

    @property
    def name(self) -> str:
        return "analyze"

    async def run(
        self,
        ctx: PipelineContext,
        provider: CompletionsProvider,
    ) -> None:
        if not ctx.shell or not ctx.profile:
            return

        if not ctx.shell.processes:
            return

        processes = ctx.shell.processes(ctx.profile, ctx.params)
        for p in processes:
            process_id = p.get("id")
            process_params = p.get("params", {})

            if not process_id:
                continue

            process = PROCESSES.ANALYZE.get(process_id)
            if not process:
                raise Exception(f"Unknown analyze process: {process_id}")

            ctx.values = run_process(process, ctx.values, process_params)
            ctx.profile = profile_rows(ctx.values)

            if "log" in process:
                ctx.logs.append(process["log"](process_params))

        logger.debug(f"analyze: {ctx.profile}")


class ValidatePhase(Phase):
    """Phase 5: Validate shell parameters against profile."""

    @property
    def name(self) -> str:
        return "validate"

    async def run(
        self,
        ctx: PipelineContext,
        provider: CompletionsProvider,
    ) -> None:
        if not ctx.shell or not ctx.profile:
            return

        # This raises ShellError if validation fails
        ctx.shell.validate_or_raise(ctx.profile, ctx.params)


class CompilePhase(Phase):
    """Phase 6: Generate the final visualization spec."""

    @property
    def name(self) -> str:
        return "compile"

    async def run(
        self,
        ctx: PipelineContext,
        provider: CompletionsProvider,
    ) -> None:
        if not ctx.shell:
            return

        spec = ctx.shell.compile(ctx.params, _sanitize_values(ctx.values), "vega-lite")
        if spec:
            ctx.spec = spec


class Pipeline:
    """Orchestrates the execution of pipeline phases.

    The pipeline runs each phase in sequence, passing the shared context
    between them. If a phase signals to stop (via ctx.stop() or ctx.add_error()),
    the pipeline halts early.
    """

    def __init__(self, phases: List[Phase]):
        self.phases = phases

    async def run(
        self,
        ctx: PipelineContext,
        provider: CompletionsProvider,
    ) -> PipelineContext:
        """Execute all phases in sequence.

        Returns the final context with results.
        """
        for phase in self.phases:
            if not ctx.should_continue:
                logger.debug(f"Pipeline stopped before phase: {phase.name}")
                break

            logger.debug(f"Running phase: {phase.name}")
            try:
                await phase.run(ctx, provider)
            except AppError as e:
                ctx.add_error(e)
                break
            except Exception as e:
                logger.exception(f"Unexpected error in phase {phase.name}: {e}")
                ctx.errors.append(
                    {
                        "code": "UNEXPECTED_ERROR",
                        "message": str(e),
                        "details": {"phase": phase.name},
                    }
                )
                ctx.logs.append("An unexpected error occurred.")
                ctx.should_continue = False
                break

        return ctx


def create_default_pipeline() -> Pipeline:
    """Create the optimized visualization pipeline (combined mode).

    Uses CombinedDecisionPhase to consolidate intent parsing, extraction,
    and shell selection, reducing latency with fewer LLM calls.

    Note: For local/smaller models, use create_sequential_pipeline() instead.
    """
    return Pipeline(
        [
            LoadDataPhase(),
            CombinedDecisionPhase(),
            FillParamsPhase(),
            AnalyzePhase(),
            ValidatePhase(),
            CompilePhase(),
        ]
    )


def create_sequential_pipeline() -> Pipeline:
    """Create a sequential visualization pipeline (sequential mode).

    Uses separate phases for intent parsing, extraction, and shell selection,
    with forced tool calls for each. This is more reliable for local/smaller
    models that struggle with parallel tool calling.

    Phases:
    1. LoadData - Load and profile CSV data
    2. ParseIntent - Extract user's analytical goal and field usage
    3. Extract - Apply data filtering/transformation (forced tool call)
    4. ChooseShell - Select visualization type (forced tool call)
    5. FillParams - Fill shell parameters (forced tool call)
    6. Analyze - Run shell-specific analysis
    7. Validate - Validate parameters
    8. Compile - Generate Vega-Lite spec
    """
    return Pipeline(
        [
            LoadDataPhase(),
            ParseIntentPhase(),
            ExtractPhase(),
            ChooseShellPhase(),
            FillParamsPhase(),
            AnalyzePhase(),
            ValidatePhase(),
            CompilePhase(),
        ]
    )


def create_pipeline(combine: bool = False) -> Pipeline:
    """Create a visualization pipeline with the specified mode.

    Args:
        combine: If True, use combined pipeline (fast, fewer LLM calls).
                 If False, use sequential pipeline (reliable, separate forced tool calls).
                 Use False (sequential) for local/smaller models.

    Returns:
        A configured Pipeline instance.
    """
    if combine:
        return create_default_pipeline()
    else:
        return create_sequential_pipeline()


def _sanitize_values(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Clean row values, replacing non-finite floats with None."""
    out = []
    for r in rows:
        clean = {}
        for k, v in r.items():
            if isinstance(v, float) and not math.isfinite(v):
                clean[k] = None
            else:
                clean[k] = v
        out.append(clean)
    return out


__all__ = [
    "AnalyzePhase",
    "ChooseShellPhase",
    "CombinedDecisionPhase",
    "CompilePhase",
    "CompletionsProvider",
    "DefaultCompletionsProvider",
    "ExtractPhase",
    "FillParamsPhase",
    "LoadDataPhase",
    "ParseIntentPhase",
    "Phase",
    "Pipeline",
    "PipelineContext",
    "RateLimitedCompletionsProvider",
    "ValidatePhase",
    "create_default_pipeline",
    "create_pipeline",
    "create_sequential_pipeline",
]
