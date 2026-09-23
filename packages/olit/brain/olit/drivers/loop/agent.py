"""The open-ended agent loop: LLM -> tool calls -> results -> repeat."""

import json
import logging

from olit import compaction
from olit.substrate import Cancellation
from olit.substrate.llm.json_parse import loads_with_repair

from .brief import brief

from .secret_redaction import collect_secret_values, redact_secrets
from .tools import ToolSurface, plain_tool_name, without_control_tokens

logger = logging.getLogger(__name__)

# A backstop for an unattended tab; pi and loom cap nothing. Exhaustion is reported.
MAX_STEPS = 40
# Output hit the token limit, so its tool calls may be silently incomplete.
TRUNCATED = "length"
TRUNCATED_ERROR = (
    'Tool call "{name}" was not executed: the response hit the output token limit, so '
    "its arguments may be truncated. Re-issue the tool call with complete arguments."
)
MALFORMED_ARGS_ERROR = (
    'Tool call "{name}" was not executed: its arguments are not valid JSON ({detail}). '
    "Re-issue the tool call with valid arguments as one JSON object. Do not paste tool "
    "results or file contents into an "
    "argument: read them from the value the earlier tool already returned."
)
# pi's wording for a call dropped because the run was aborted.
ABORTED_ERROR = "Operation aborted"
# How a turn ended. One of these is assigned at every exit, so no branch can leave the
# outcome half-described; the initial value is what a spent step budget looks like.
EXHAUSTED, ABORTED, REPLIED, FINISHED = "exhausted", "aborted", "replied", "finished"
MAX_TOOL_RESULT_BYTES = 64 * 1024
OVERSIZED_RESULT_ERROR = (
    'Tool call "{name}" returned {size} KB, over the {cap} KB limit for a single result, so '
    "it was discarded. Re-issue it with a narrower query: add a filter, or set a smaller "
    "limit and page with offset."
)


class LoopDriver:
    def __init__(self, substrate, processes=None, skills=None):
        self.substrate = substrate
        self.processes = processes
        self.skills = skills
        self.compaction = compaction.Settings(
            getattr(substrate, "config", None), getattr(substrate.llm, "target", None)
        )
        # A tool result carries whatever a command printed, including a key it read.
        self.secrets = collect_secret_values(getattr(substrate, "config", None))
        config = getattr(substrate, "config", None) or {}
        self.max_steps = int(config.get("max_steps") or MAX_STEPS)

    async def run(self, transcripts, on_event=None, cancellation=None, confirmation=None,
                  artifacts=None):
        # One surface per turn. Earlier turns' artifacts are handed in by the caller, which
        # holds them: this driver is rebuilt whenever the session's config changes.
        tools = ToolSurface(self.substrate, self.processes, self.skills, confirmation, artifacts)
        messages = [dict(m) for m in transcripts]
        # This run's output, kept apart from the transcript that compaction rewrites.
        produced = []
        logs = []
        ended = EXHAUSTED
        reported_overflow = False
        usage = {"input": 0, "output": 0, "cost": None}
        # The provider's own token count and where it was measured.
        measured = None
        cancellation = cancellation or Cancellation()

        steps = 0
        for _ in range(self.max_steps):
            steps += 1
            if cancellation.aborted:
                ended = ABORTED
                break

            # Top of a step is the only point where every tool call has its result.
            messages, status = await compaction.compact(
                messages, self.substrate.llm, self.compaction, cancellation, measured
            )
            if status == compaction.COMPACTED:
                logs.append("compacted the conversation")
                _emit(on_event, {"type": "compacted"})
                # The index it carried does not point into the rewritten transcript.
                measured = None
            elif status == compaction.IMPOSSIBLE and not reported_overflow:
                # Once per turn: the condition persists and would bury the output.
                reported_overflow = True
                logs.append("over the context budget with nothing left to compact")
                _emit(on_event, {"type": "context_overflow"})

            try:
                reply = await self.substrate.llm.complete(
                    messages,
                    tools=tools.schemas(),
                    cancellation=cancellation,
                    on_retry=lambda info: _emit(on_event, {"type": "llm_retry", **info}),
                )
            except Exception:
                # The flag decides whether this was the abort, never the error text.
                if not cancellation.aborted:
                    raise
                ended = ABORTED
                break

            # Providers disagree on the key names, and some report only a total.
            _u = reply.usage or {}
            _in = _u.get("prompt_tokens") or _u.get("input_tokens") or 0
            _out = _u.get("completion_tokens") or _u.get("output_tokens") or 0
            if not _in and not _out:
                _out = _u.get("total_tokens") or 0
            usage["input"] += int(_in)
            usage["output"] += int(_out)
            # Only providers that price the call report this; others leave it None.
            if _u.get("cost") is not None:
                usage["cost"] = (usage["cost"] or 0.0) + float(_u["cost"])
            if not _u:
                logs.append("usage: provider reported none")

            truncated = reply.finish_reason == TRUNCATED
            tool_calls = reply.tool_calls
            # An empty final is ambiguous without this: a choice to stop, or a spent budget.
            _detail = (reply.usage or {}).get("completion_tokens_details") or {}
            logs.append(
                f"reply: finish={reply.finish_reason} content={len(reply.content or '')} "
                f"tools={len(tool_calls or [])} "
                f"completion={(reply.usage or {}).get('completion_tokens')} "
                f"reasoning={_detail.get('reasoning_tokens')}"
            )

            assistant = {"role": "assistant", "content": reply.content or None}
            if tool_calls:
                assistant["tool_calls"] = tool_calls
            if reply.reasoning:
                assistant[reply.reasoning_key] = reply.reasoning
            messages.append(assistant)
            produced.append(assistant)
            # Kept beside the message, which goes back to the provider verbatim.
            counted = compaction.usage_tokens(reply.usage)
            if counted:
                measured = {"tokens": counted, "index": len(messages) - 1}

            if not tool_calls:
                if reply.content:
                    logs.append(f"assistant: {reply.content}")
                ended = REPLIED
                break

            # The whole batch, before any of it runs: a gate on sibling calls needs it.
            tools.observe(tool_calls)

            terminating = []
            for call in tool_calls:
                fn = call.get("function", {})
                name = fn.get("name")
                call_id = call.get("id")

                refusal = None
                gated = False
                args = {}
                if cancellation.aborted:
                    # Every remaining call still needs a result, or the next request is
                    # a tool_call with nothing answering it.
                    refusal = ABORTED_ERROR
                elif truncated:
                    refusal = TRUNCATED_ERROR.format(name=name)
                else:
                    try:
                        args = loads_with_repair(fn.get("arguments") or "{}")
                    except json.JSONDecodeError as e:
                        refusal = MALFORMED_ARGS_ERROR.format(name=name, detail=e)

                # Live tool progress; a refused call emits the pair too.
                _emit(on_event, {"type": "tool_start", "id": call_id, "name": name})
                if refusal is not None:
                    logs.append(f"refuse {name}: {refusal}")
                    content, is_error = refusal, True
                else:
                    logs.append(f"call {name}({brief(args)})")
                    outcome = await tools.dispatch(name, args, call_id)
                    logs.append(f"  -> {brief(outcome.content)}")
                    content, is_error = outcome.text, outcome.is_error
                    gated = outcome.refused
                    size = len(content.encode("utf-8"))
                    if size > MAX_TOOL_RESULT_BYTES:
                        logs.append(f"  -> discarded {size} bytes, over the result limit")
                        content, is_error = OVERSIZED_RESULT_ERROR.format(
                            name=name, size=size // 1024,
                            cap=MAX_TOOL_RESULT_BYTES // 1024), True
                tool_message = {
                    "role": "tool",
                    "tool_call_id": call_id,
                    "name": plain_tool_name(name),
                    "content": without_control_tokens(redact_secrets(content, self.secrets)),
                }
                messages.append(tool_message)
                produced.append(tool_message)
                # `is_error` rides the event so the shell states the outcome.
                _emit(
                    on_event,
                    {"type": "tool_end", "id": call_id, "name": name, "content": content,
                     "is_error": is_error, "refused": refusal is not None or gated},
                )

                # Only an executed `finish` counts; a refused one was never dispatched.
                terminating.append(name == "finish" and refusal is None)

            # pi ends a turn only when every call in the batch asked to.
            if terminating and all(terminating):
                ended = FINISHED
                break

            if cancellation.aborted:
                ended = ABORTED
                break

        return {
            "logs": logs,
            "messages": messages,
            "new_messages": produced,
            "done": ended == FINISHED,
            "aborted": ended == ABORTED,
            "exhausted": ended == EXHAUSTED,
            "artifacts": tools.artifacts,
            "usage": usage,
            "steps": steps,
            "max_steps": self.max_steps,
        }


def _emit(on_event, event):
    """Deliver a progress event to the optional listener; never let it break the loop."""
    if on_event is None:
        return
    try:
        on_event(event)
    except Exception:
        logger.debug("on_event listener raised", exc_info=True)


