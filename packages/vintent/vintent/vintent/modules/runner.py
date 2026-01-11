import logging
import math
from typing import Any, Dict, List, Optional

from vintent.core.completions import completions_post, get_tool_call
from vintent.core.exceptions import DataError, VintentError

from .process import Process, run_process
from .profiler import DatasetProfile, profile_rows, rows_from_csv
from .registry import PROCESSES, SHELLS
from .schemas import CompletionsMessage, CompletionsReply, TranscriptMessageType
from .tools import (
    NO_PROCESS_ID,
    build_choose_process_tool,
    build_choose_shell_tool,
    build_fill_shell_params_tool,
)

logger = logging.getLogger(__name__)


class Runner:
    def __init__(self, config: Dict[str, Any]):
        self.ai_api_key = config.get("ai_api_key")
        self.ai_base_url = config.get("ai_base_url")
        self.ai_model = config.get("ai_model")

    async def run(
        self,
        transcripts: List[TranscriptMessageType],
        file_name: str,
    ) -> Dict[str, Any]:
        """Run the visualization pipeline.

        Returns a dict with:
            logs: List of human-readable log messages
            widgets: List of compiled visualization specs
            errors: List of structured error objects (if any errors occurred)
        """
        logs: List[str] = []
        widgets: List[Any] = []
        errors: List[Dict[str, Any]] = []

        try:
            # Read source dataset
            try:
                with open(file_name) as f:
                    csv_text = f.read()
            except FileNotFoundError:
                raise DataError(
                    f"Dataset file not found: {file_name}",
                    details={"file_name": file_name},
                )
            except IOError as e:
                raise DataError(
                    f"Failed to read dataset: {e}",
                    details={"file_name": file_name, "io_error": str(e)},
                )

            # Initial rows + profile
            values = rows_from_csv(csv_text)
            profile: DatasetProfile = profile_rows(values)

            # Incoming transcripts
            logger.debug(f"transcripts: {transcripts}")

            # STEP 0: Choose process
            extracted = await self._run_process(transcripts, PROCESSES.EXTRACT, profile, values)
            if extracted:
                params = extracted["params"]
                process = extracted["process"]
                values = extracted["values"]
                profile = profile_rows(values)
                if process and "log" in process:
                    logs.append(process["log"](params))

            # STEP 1: Choose shell
            choose_reply = await self._completions(transcripts, [build_choose_shell_tool(profile)])
            if not choose_reply:
                logs.append("No visualization could be selected.")
                return dict(logs=logs, widgets=widgets, errors=errors)
            choose_shell = get_tool_call("choose_shell", choose_reply)
            if not choose_shell or not choose_shell.get("shellId"):
                logs.append("No compatible visualization shell available.")
                return dict(logs=logs, widgets=widgets, errors=errors)
            shell_id = choose_shell["shellId"]
            shell = SHELLS.get(shell_id)
            if not shell:
                logs.append(f"Unknown shell selected: {shell_id}")
                return dict(logs=logs, widgets=widgets, errors=errors)
            logs.append(f"Selected shell: {shell_id}")
            logger.debug(f"choose_shell_tool: {shell_id}")
            logger.debug(f"profile: {profile}")

            # STEP 2: Fill parameters
            params = {}
            fill_tool = build_fill_shell_params_tool(shell, profile)
            if fill_tool:
                param_reply = await self._completions(
                    transcripts,
                    [fill_tool],
                )
                if param_reply:
                    filled = get_tool_call("fill_shell_params", param_reply)
                    if filled:
                        params.update(filled)
                        logger.debug(f"fill_shell_params_tool: {params}")

            # STEP 3: Analyze
            if shell.processes:
                processes = shell.processes(profile, params)
                for p in processes:
                    process_id = p["id"]
                    process_params = p.get("params", {})
                    if process_id:
                        process = PROCESSES.ANALYZE.get(process_id)
                        if not process:
                            raise Exception(f"Unknown analyze process: {process_id}")
                        values = run_process(process, values, process_params)
                        profile = profile_rows(values)
                        if process and "log" in process:
                            logs.append(process["log"](process_params))
                logger.debug(f"analyze: {profile}")

            # STEP 4: Validate (raises ShellError if invalid)
            shell.validate_or_raise(profile, params)

            # STEP 5: Compile
            spec = shell.compile(params, _sanitize_values(values), "vega-lite")
            if spec:
                widgets.append(spec)

        except VintentError as e:
            logger.error(f"Vintent error: {e.code} - {e.message}")
            errors.append(e.to_dict())
            logs.append(f"Error: {e.message}")

        except Exception as e:
            # Catch-all for unexpected errors
            logger.exception(f"Unexpected error in Runner.run: {e}")
            errors.append(
                {
                    "code": "UNEXPECTED_ERROR",
                    "message": str(e),
                    "details": {},
                }
            )
            logs.append("An unexpected error occurred.")

        return dict(logs=logs, widgets=widgets, errors=errors)

    async def _completions(
        self,
        transcripts: List[TranscriptMessageType],
        tools: List[Dict[str, Any]],
    ) -> Optional[CompletionsReply]:
        return await completions_post(
            dict(
                ai_base_url=self.ai_base_url,
                ai_api_key=self.ai_api_key,
                ai_model=self.ai_model,
                messages=_sanitize_transcripts(transcripts),
                tools=tools,
            )
        )

    async def _run_process(
        self,
        transcripts: List[TranscriptMessageType],
        processes: Dict[str, Process],
        profile: DatasetProfile,
        values: List[Dict[str, Any]],
    ):
        reply = await self._completions(
            transcripts,
            [build_choose_process_tool(processes, profile, context=transcripts)],
        )
        process_id: Optional[str] = None
        params: Dict[str, Any] = {}
        if reply:
            chosen = get_tool_call("choose_process", reply)
            if chosen:
                logger.debug(f"choose_process_tool: {chosen}")
                pid = chosen.get("id")
                if pid and pid != NO_PROCESS_ID:
                    process_id = pid
                    params = chosen.get("params", {})
        if process_id:
            process = processes.get(process_id)
            values = run_process(process, values, params)
            return dict(params=params, process=process, values=values)
        return None


def _sanitize_transcripts(
    transcripts: List[TranscriptMessageType],
) -> List[CompletionsMessage]:
    sanitized: List[CompletionsMessage] = []
    for t in transcripts:
        content = t.get("content")
        if isinstance(content, str) and content:
            sanitized.append(
                {
                    "role": t.get("role", ""),
                    "content": content,
                }
            )
    return sanitized


def _sanitize_values(rows):
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
