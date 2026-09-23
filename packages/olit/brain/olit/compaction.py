"""Context compaction: replace the oldest conversation with a summary of it."""

import logging
import math

logger = logging.getLogger(__name__)

# pi's AgentHarness defaults.
RESERVE_TOKENS = 16384
KEEP_RECENT_TOKENS = 20000
# Configuration, not discovery: a small local model needs `ai_context_window` lowered.
DEFAULT_CONTEXT_WINDOW = 128000

# pi's wrappers, from `harness/messages.js`.
COMPACTION_SUMMARY_PREFIX = (
    "The conversation history before this point was compacted into the following summary:\n\n<summary>\n"
)
COMPACTION_SUMMARY_SUFFIX = "\n</summary>"

TOOL_RESULT_MAX_CHARS = 2000

SUMMARIZATION_SYSTEM_PROMPT = """You are a context summarization assistant. Your task is to read a conversation between a user and an AI assistant, then produce a structured summary following the exact format specified.

Do NOT continue the conversation. Do NOT respond to any questions in the conversation. ONLY output the structured summary."""

SUMMARIZATION_PROMPT = """The messages above are a conversation to summarize. Create a structured context checkpoint summary that another LLM will use to continue the work.

Use this EXACT format:

## Goal
[What is the user trying to accomplish? Can be multiple items if the session covers different tasks.]

## Constraints & Preferences
- [Any constraints, preferences, or requirements mentioned by user]
- [Or "(none)" if none were mentioned]

## Progress
- [x] [Completed tasks/changes]

### In Progress
- [ ] [Current work]

### Blocked
- [Issues preventing progress, if any]

## Key Decisions
- **[Decision]**: [Brief rationale]

## Next Steps
1. [Ordered list of what should happen next]

## Critical Context
- [Any data, examples, or references needed to continue]
- [Or "(none)" if not applicable]

Keep each section concise. Preserve exact file paths, function names, and error messages."""

UPDATE_SUMMARIZATION_PROMPT = """The messages above are NEW conversation messages to incorporate into the existing summary provided in <previous-summary> tags.

Update the existing structured summary with new information. RULES:
- PRESERVE all existing information from the previous summary
- ADD new progress, decisions, and context from the new messages
- UPDATE the Progress section: move items from "In Progress" to "Done" when completed
- UPDATE "Next Steps" based on what was accomplished
- PRESERVE exact file paths, function names, and error messages
- If something is no longer relevant, you may remove it

Use this EXACT format:

## Goal
[Preserve existing goals, add new ones if the task expanded]

## Constraints & Preferences
- [Preserve existing, add new ones discovered]

## Progress
- [x] [Include previously done items AND newly completed items]

### In Progress
- [ ] [Current work - update based on progress]

### Blocked
- [Current blockers - remove if resolved]

## Key Decisions
- **[Decision]**: [Brief rationale] (preserve all previous, add new)

## Next Steps
1. [Update based on current state]

## Critical Context
- [Preserve important context, add new if needed]

Keep each section concise. Preserve exact file paths, function names, and error messages."""


class Settings:
    def __init__(self, config=None, target=None):
        """The reserve is the `max_tokens` the request carries, capped by the endpoint."""
        config = config or {}
        self.enabled = config.get("ai_compaction", True)
        self.context_window = (
            config.get("ai_context_window")
            or (target.context_window if target else None)
            or DEFAULT_CONTEXT_WINDOW
        )
        self.reserve_tokens = (
            config.get("ai_reserve_tokens")
            or (target.max_tokens if target else None)
            or RESERVE_TOKENS
        )
        keep = config.get("ai_keep_recent_tokens") or KEEP_RECENT_TOKENS
        # Keeping more than the window holds would decline compaction forever.
        self.budget = max(0, self.context_window - self.reserve_tokens)
        self.keep_recent_tokens = min(keep, self.budget)
        if self.keep_recent_tokens < keep:
            logger.info(
                "keep_recent_tokens clamped from %d to %d (window %d - reserve %d)",
                keep,
                self.keep_recent_tokens,
                self.context_window,
                self.reserve_tokens,
            )


def estimate_tokens(message):
    """pi's estimate: characters over four."""
    chars = len(message.get("content") or "")
    for call in message.get("tool_calls") or []:
        fn = call.get("function") or {}
        chars += len(fn.get("name") or "") + len(fn.get("arguments") or "")
    return math.ceil(chars / 4)


def usage_tokens(usage):
    """What the provider says the request cost."""
    usage = usage or {}
    total = usage.get("total_tokens")
    if total:
        return total
    return (usage.get("prompt_tokens") or 0) + (usage.get("completion_tokens") or 0)


def context_tokens(messages, measured=None):
    """How much context the next request carries; measured usage beats the estimate."""
    if measured:
        after = messages[measured["index"] + 1:]
        return measured["tokens"] + sum(estimate_tokens(m) for m in after)
    return sum(estimate_tokens(m) for m in messages)


def should_compact(tokens, settings):
    """pi's trigger: over the window minus the reserve kept for the reply."""
    if not settings.enabled:
        return False
    return tokens > settings.context_window - settings.reserve_tokens


def _is_valid_cut(message):
    """Where the kept tail may begin; never a tool result, which needs its call."""
    return message.get("role") in ("user", "assistant")


def find_cut_index(messages, keep_recent_tokens):
    """Where the kept tail starts: the nearest valid cut once the budget is covered."""
    valid = [i for i, m in enumerate(messages) if _is_valid_cut(m)]
    if not valid:
        return None

    accumulated = 0
    cut = valid[0]
    for i in range(len(messages) - 1, -1, -1):
        tokens = estimate_tokens(messages[i])
        if tokens == 0:
            continue
        accumulated += tokens
        if accumulated >= keep_recent_tokens:
            following = [c for c in valid if c >= i]
            if following:
                cut = following[0]
            break
    return cut


def serialize(messages):
    """The conversation as text, so the model summarizes rather than continues it."""
    parts = []
    for message in messages:
        role = message.get("role")
        content = message.get("content") or ""
        if role == "user":
            if content:
                parts.append(f"[User]: {content}")
        elif role == "assistant":
            if content:
                parts.append(f"[Assistant]: {content}")
            calls = []
            for call in message.get("tool_calls") or []:
                fn = call.get("function") or {}
                calls.append(f"{fn.get('name')}({fn.get('arguments') or ''})")
            if calls:
                parts.append(f"[Assistant tool calls]: {'; '.join(calls)}")
        elif role == "tool":
            if content:
                parts.append(f"[Tool result]: {_truncate(content, TOOL_RESULT_MAX_CHARS)}")
    return "\n\n".join(parts)


def _truncate(text, max_chars):
    if len(text) <= max_chars:
        return text
    return f"{text[:max_chars]}\n\n[... {len(text) - max_chars} more characters truncated]"


def previous_summary(messages):
    """The summary from an earlier compaction, if this session already has one."""
    for message in messages:
        content = message.get("content") or ""
        if message.get("role") == "user" and content.startswith(COMPACTION_SUMMARY_PREFIX):
            body = content[len(COMPACTION_SUMMARY_PREFIX):]
            if body.endswith(COMPACTION_SUMMARY_SUFFIX):
                body = body[: -len(COMPACTION_SUMMARY_SUFFIX)]
            return body
    return None


def summary_message(summary):
    return {"role": "user", "content": COMPACTION_SUMMARY_PREFIX + summary + COMPACTION_SUMMARY_SUFFIX}


def build_prompt(older, prior):
    """The summarization request: conversation first, then the format to produce."""
    text = f"<conversation>\n{serialize(older)}\n</conversation>\n\n"
    if prior:
        text += f"<previous-summary>\n{prior}\n</previous-summary>\n\n"
    text += UPDATE_SUMMARIZATION_PROMPT if prior else SUMMARIZATION_PROMPT
    return text


def split(messages, settings):
    """(system, older, recent), or None when there is nothing worth compacting."""
    leading = 1 if messages and messages[0].get("role") == "system" else 0
    system, rest = messages[:leading], messages[leading:]

    cut = find_cut_index(rest, settings.keep_recent_tokens)
    if cut is None or cut == 0:
        # Everything is recent, or there is no lawful place to cut.
        return None
    return system, rest[:cut], rest[cut:]


# What compact() did; "not needed" and "could not" read very differently to a user.
NOT_NEEDED = "not_needed"
COMPACTED = "compacted"
IMPOSSIBLE = "impossible"


async def compact(messages, llm, settings, cancellation=None, measured=None):
    """Replace the oldest messages with a summary; returns (messages, status)."""
    if not should_compact(context_tokens(messages, measured), settings):
        return messages, NOT_NEEDED

    parts = split(messages, settings)
    if parts is None:
        # Over the threshold with nothing older to summarize; the caller reports it.
        logger.warning(
            "over the compaction threshold with nothing older to summarize "
            "(window %d, reserve %d, keep_recent %d)",
            settings.context_window,
            settings.reserve_tokens,
            settings.keep_recent_tokens,
        )
        return messages, IMPOSSIBLE
    system, older, recent = parts

    prior = previous_summary(older)
    request = [
        {"role": "system", "content": SUMMARIZATION_SYSTEM_PROMPT},
        {"role": "user", "content": build_prompt(older, prior)},
    ]
    # No tools: this call summarizes, it does not act.
    reply = await llm.complete(request, cancellation=cancellation)
    summary = reply.content or ""
    if not summary.strip():
        # An empty summary would delete the history and replace it with nothing.
        logger.warning("summarization returned nothing; leaving the conversation intact")
        return messages, IMPOSSIBLE

    logger.info(
        "compacted %d messages into a summary, kept %d",
        len(older),
        len(recent),
    )
    return [*system, summary_message(summary), *recent], COMPACTED
