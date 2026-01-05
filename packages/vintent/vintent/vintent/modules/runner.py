from typing import Any, Dict, List, Optional

from vintent.core.completions import completions_post, get_tool_call

from .process import PROCESSES, run_process
from .profiler import DatasetProfile, profile_rows, rows_from_csv
from .schemas import CompletionsMessage, CompletionsReply, TranscriptMessageType
from .shells import SHELLS
from .tools import (
    NO_PROCESS_ID,
    build_choose_extract_tool,
    build_choose_shell_tool,
    build_fill_shell_params_tool,
)


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
        logs: List[str] = []
        widgets: List[Any] = []

        # Read source dataset
        with open(file_name) as f:
            csv_text = f.read()

        # Initial rows + profile
        values = rows_from_csv(csv_text)
        profile: DatasetProfile = profile_rows(values)

        # STEP 0: Choose process
        process_reply = await self._completions(
            transcripts,
            [build_choose_extract_tool(PROCESSES.EXTRACT, profile)],
        )

        process_id: Optional[str] = None
        params: Dict[str, Any] = {}

        if process_reply:
            chosen = get_tool_call(
                "choose_process",
                process_reply.get("choices", [{}])[0].get("message", {}).get("tool_calls"),
            )
            if chosen:
                pid = chosen.get("id")
                if pid and pid != NO_PROCESS_ID:
                    process_id = pid
                    params = chosen.get("params", {})

        if process_id:
            process = PROCESSES.EXTRACT.get(process_id)
            values = run_process(process, values, params)
            profile = profile_rows(values)
            if process and "log" in process:
                logs.append(process["log"](params))

        # STEP 1: Choose shell
        choose_reply = await self._completions(
            transcripts,
            [build_choose_shell_tool(profile)],
        )

        if not choose_reply:
            logs.append("No visualization could be selected.")
            return dict(logs=logs, widgets=widgets)

        choose_shell = get_tool_call(
            "choose_shell",
            choose_reply.get("choices", [{}])[0].get("message", {}).get("tool_calls"),
        )

        if not choose_shell or not choose_shell.get("shellId"):
            logs.append("No compatible visualization shell available.")
            return dict(logs=logs, widgets=widgets)

        shell_id = choose_shell["shellId"]
        shell = SHELLS.get(shell_id)

        if not shell:
            logs.append(f"Unknown shell selected: {shell_id}")
            return dict(logs=logs, widgets=widgets)

        logs.append(f"Selected shell: {shell_id}")
        print("[vintent]", profile)

        """
        # STEP 2: Transform for later, leave outcommented
        if shell.process_transform:
            values = run_process(
                PROCESS_PHASE.TRANSFORM,
                shell.process_transform["id"],
                values,
            )
            profile = profile_rows(values)
        """

        # STEP 3: Fill parameters
        params = {}
        fill_tool = build_fill_shell_params_tool(shell, profile)
        if fill_tool:
            param_reply = await self._completions(
                transcripts,
                [fill_tool],
            )
            if param_reply:
                filled = get_tool_call(
                    "fill_shell_params",
                    param_reply.get("choices", [{}])[0].get("message", {}).get("tool_calls"),
                )
                if filled:
                    params.update(filled)

        # STEP 4: Finalize
        if shell.process_finalize:
            processes = shell.process_finalize(params)
            for p in processes:
                process_id = p["id"]
                process_params = p.get("params", {})
                if process_id:
                    process = PROCESSES.FINALIZE.get(process_id)
                    if not process:
                        raise Exception(f"Unknown finalize process: {process_id}")
                    values = run_process(process, values, process_params)
                    profile = profile_rows(values)
                    if process and "log" in process:
                        logs.append(process["log"](process_params))
            print("[vintent] Post-finalize: ", profile)

        # STEP 5: Validate
        validation = shell.validate(params, profile)
        if not validation.get("ok"):
            logs.append("Visualization parameters invalid.")
            return dict(logs=logs, widgets=widgets)

        # STEP 6: Compile
        spec = shell.compile(params, values, "vega-lite")
        if spec:
            widgets.append(spec)
        return dict(logs=logs, widgets=widgets)

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
