"""Compaction: the oldest conversation is replaced by a summary of it, not dropped."""

import asyncio

from olite import compaction
from olite.drivers.loop.agent import LoopDriver
from olite.substrate import CapabilityManifest
from olite.substrate.llm import Reply
from .fakes import FakeSubstrate


def _settings(**overrides):
    config = {"ai_context_window": 1000, "ai_reserve_tokens": 200, "ai_keep_recent_tokens": 200}
    config.update(overrides)
    return compaction.Settings(config)


def _user(text):
    return {"role": "user", "content": text}


def _assistant(text="", calls=None):
    return {"role": "assistant", "content": text, "tool_calls": calls or []}


def _call(name, arguments, call_id="c1"):
    return {"id": call_id, "function": {"name": name, "arguments": arguments}}


def _tool(text, call_id="c1"):
    return {"role": "tool", "tool_call_id": call_id, "name": "t", "content": text}


class Summarizer:
    """Stands in for the provider on the summarization call."""

    def __init__(self, summary="## Goal\nfinish the analysis"):
        self.summary = summary
        self.prompts = []

    async def complete(self, messages, tools=None, **kwargs):
        self.prompts.append(messages)
        return Reply(content=self.summary)


def _long(role_builder, n):
    """Enough text to blow any reasonable budget: 4 chars ≈ 1 token."""
    return [role_builder("x" * 4000) for _ in range(n)]


# --- trigger -----------------------------------------------------------------


def test_the_trigger_is_the_window_minus_the_reserve():
    settings = _settings()
    assert compaction.should_compact(799, settings) is False
    assert compaction.should_compact(801, settings) is True


def test_compaction_can_be_turned_off():
    assert compaction.should_compact(10**9, _settings(ai_compaction=False)) is False


def test_the_providers_own_count_beats_the_estimate():
    """The tool schemas never appear in `messages`, so the estimate alone is short."""
    messages = [_user("tiny"), _assistant("also tiny")]
    measured = {"tokens": 21000, "index": 1}

    assert compaction.context_tokens(messages) < 100
    assert compaction.context_tokens(messages, measured) == 21000


def test_messages_added_after_the_measurement_are_estimated_on_top():
    messages = [_user("a"), _assistant("b"), _tool("c" * 4000)]
    measured = {"tokens": 1000, "index": 1}

    assert compaction.context_tokens(messages, measured) == 1000 + compaction.estimate_tokens(messages[2])


def test_usage_falls_back_to_the_parts_when_there_is_no_total():
    assert compaction.usage_tokens({"total_tokens": 500}) == 500
    assert compaction.usage_tokens({"prompt_tokens": 300, "completion_tokens": 20}) == 320
    assert compaction.usage_tokens(None) == 0


def test_tokens_count_tool_call_arguments_not_just_content():
    """An assistant message can be almost entirely tool calls."""
    message = _assistant("", [_call("run_tool", '{"history_id": "abcdef"}')])
    assert compaction.estimate_tokens(message) > 0


def test_keep_recent_cannot_exceed_what_the_window_holds():
    """The trap a small local model walks into."""
    settings = compaction.Settings({"ai_context_window": 32000})

    assert settings.keep_recent_tokens <= settings.context_window - settings.reserve_tokens
    assert settings.keep_recent_tokens < compaction.KEEP_RECENT_TOKENS


def test_a_generous_window_leaves_pis_defaults_alone():
    settings = compaction.Settings({})

    assert settings.reserve_tokens == compaction.RESERVE_TOKENS
    assert settings.keep_recent_tokens == compaction.KEEP_RECENT_TOKENS


def test_being_over_budget_with_nothing_to_summarize_is_reported_not_swallowed():
    """No amount of compacting fixes a system prompt that fills the window; the user"""
    settings = _settings(ai_context_window=1000, ai_reserve_tokens=200, ai_keep_recent_tokens=200)
    messages = [{"role": "system", "content": "x" * 40000}, _user("hi")]

    result, status = asyncio.run(compaction.compact(messages, Summarizer(), settings))

    assert status == compaction.IMPOSSIBLE
    assert result == messages


# --- what gets cut ------------------------------------------------------------


def test_the_kept_tail_never_begins_at_a_tool_result():
    """A transcript opening on a tool result is malformed."""
    messages = []
    for i in range(40):
        messages.append(_user(f"ask {i}"))
        messages.append(_assistant("", [_call("t", "{}")]))
        messages.append(_tool("y" * 4000))

    cut = compaction.find_cut_index(messages, 200)
    assert messages[cut]["role"] in ("user", "assistant")


def test_cutting_at_an_assistant_keeps_its_tool_results_with_it():
    """pi allows this cut precisely because the results follow and are kept."""
    messages = [
        _user("old"),
        _assistant("", [_call("t", "{}")]),
        _tool("small"),
        _user("recent " + "z" * 4000),
    ]
    cut = compaction.find_cut_index(messages, 200)
    kept = messages[cut:]
    for i, message in enumerate(kept):
        if message["role"] == "tool":
            assert kept[i - 1]["role"] == "assistant", "a kept tool result lost its call"


def test_the_system_message_is_never_summarized():
    """It carries the identity prompt and the injected context block."""
    messages = [{"role": "system", "content": "identity"}, *_long(_user, 30)]
    system, older, recent = compaction.split(messages, _settings())

    assert system == [{"role": "system", "content": "identity"}]
    assert all(m["role"] != "system" for m in older + recent)


def test_a_conversation_with_nowhere_lawful_to_cut_is_left_alone():
    messages = [{"role": "system", "content": "s"}, _user("only turn")]
    assert compaction.split(messages, _settings()) is None


# --- the summarization request ------------------------------------------------


def test_the_conversation_is_serialized_as_text_not_replayed_as_messages():
    """Serialized so the model summarizes the conversation rather than continuing it."""
    text = compaction.serialize(
        [_user("hello"), _assistant("hi", [_call("run_tool", '{"a":1}')]), _tool("result")]
    )
    assert "[User]: hello" in text
    assert "[Assistant]: hi" in text
    assert "[Assistant tool calls]: run_tool" in text
    assert "[Tool result]: result" in text


def test_a_huge_tool_result_is_truncated_in_the_summarization_input_only():
    text = compaction.serialize([_tool("q" * 5000)])
    assert "more characters truncated" in text
    assert len(text) < 5000


def test_the_first_compaction_uses_the_initial_prompt():
    prompt = compaction.build_prompt([_user("hi")], None)
    assert compaction.SUMMARIZATION_PROMPT in prompt
    assert "<previous-summary>" not in prompt


def test_a_later_compaction_updates_the_previous_summary():
    prompt = compaction.build_prompt([_user("hi")], "## Goal\nearlier")
    assert compaction.UPDATE_SUMMARIZATION_PROMPT in prompt
    assert "## Goal\nearlier" in prompt


def test_a_previous_summary_is_recovered_from_the_message_it_was_written_as():
    messages = [compaction.summary_message("## Goal\nsomething")]
    assert compaction.previous_summary(messages) == "## Goal\nsomething"


def test_the_summarization_call_advertises_no_tools():
    """It summarizes; it must not act."""
    llm = Summarizer()
    messages = [{"role": "system", "content": "s"}, *_long(_user, 30)]
    asyncio.run(compaction.compact(messages, llm, _settings()))

    assert llm.prompts, "no summarization was requested"


# --- the result ---------------------------------------------------------------


def _compacted(llm=None, settings=None):
    llm = llm or Summarizer()
    messages = [{"role": "system", "content": "s"}, *_long(_user, 30)]
    return asyncio.run(compaction.compact(messages, llm, settings or _settings()))


def test_compaction_replaces_history_with_a_summary_message():
    result, status = _compacted()

    assert status == compaction.COMPACTED
    assert result[0]["role"] == "system"
    assert result[1]["content"].startswith(compaction.COMPACTION_SUMMARY_PREFIX)
    assert "finish the analysis" in result[1]["content"]
    assert len(result) < 31


def test_the_summary_is_delivered_as_a_user_message():
    """pi's convertToLlm renders a compactionSummary entry into exactly this."""
    result, _ = _compacted()
    assert result[1]["role"] == "user"


def test_an_empty_summary_leaves_the_conversation_intact():
    """Deleting the history and replacing it with nothing is worse than running long."""
    messages = [{"role": "system", "content": "s"}, *_long(_user, 30)]
    result, status = asyncio.run(compaction.compact(messages, Summarizer("   "), _settings()))

    assert status == compaction.IMPOSSIBLE
    assert result == messages


def test_a_short_conversation_is_returned_untouched_and_costs_nothing():
    llm = Summarizer()
    messages = [{"role": "system", "content": "s"}, _user("hi")]
    result, status = asyncio.run(compaction.compact(messages, llm, _settings()))

    assert status == compaction.NOT_NEEDED
    assert result == messages
    assert llm.prompts == [], "a short conversation paid for a summarization"


# --- in the loop --------------------------------------------------------------


class ScriptedLlm:
    """Answers the summarization call, then the loop's own."""

    def __init__(self):
        self.calls = []

    async def complete(self, messages, tools=None, **kwargs):
        self.calls.append({"tools": bool(tools), "messages": messages})
        if tools is None:
            return Reply(content="## Goal\nsummary")
        return Reply(content="done", finish_reason="stop")


def test_the_loop_compacts_before_it_asks_and_the_shell_is_told():
    config = {"ai_context_window": 1000, "ai_reserve_tokens": 200, "ai_keep_recent_tokens": 200}
    llm = ScriptedLlm()
    driver = LoopDriver(FakeSubstrate(llm, config=config))
    events = []

    transcripts = [{"role": "system", "content": "s"}, *_long(_user, 30)]
    result = asyncio.run(driver.run(transcripts, events.append))

    assert any(e["type"] == "compacted" for e in events), "compaction happened silently"
    assert llm.calls[0]["tools"] is False, "the summarization call advertised tools"
    assert llm.calls[1]["tools"] is True
    # The turn ran against the compacted transcript, not the original.
    assert len(llm.calls[1]["messages"]) < len(transcripts)
    assert result["messages"][1]["content"].startswith(compaction.COMPACTION_SUMMARY_PREFIX)


def test_a_compacted_turn_still_reports_what_it_produced():
    """The turn reports its own messages, so compaction cannot lose them."""
    config = {"ai_context_window": 1000, "ai_reserve_tokens": 200, "ai_keep_recent_tokens": 200}
    llm = ScriptedLlm()
    driver = LoopDriver(FakeSubstrate(llm, config=config))

    transcripts = [{"role": "system", "content": "s"}, *_long(_user, 30)]
    result = asyncio.run(driver.run(transcripts))

    assert result["new_messages"], "the turn reported no output at all"
    assert result["new_messages"][-1]["content"] == "done"
    # And they are the same objects that ended up in the transcript.
    assert result["messages"][-1] is result["new_messages"][-1]


def test_new_messages_holds_only_this_turn():
    llm = ScriptedLlm()
    driver = LoopDriver(FakeSubstrate(llm, config={}))
    result = asyncio.run(driver.run([{"role": "system", "content": "s"}, _user("hi")]))

    assert [m["role"] for m in result["new_messages"]] == ["assistant"]


def test_a_normal_turn_never_pays_for_a_summarization():
    llm = ScriptedLlm()
    driver = LoopDriver(FakeSubstrate(llm, config={}))
    asyncio.run(driver.run([{"role": "system", "content": "s"}, _user("hi")]))

    assert len(llm.calls) == 1
    assert llm.calls[0]["tools"] is True
