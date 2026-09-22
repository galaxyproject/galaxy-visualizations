"""Searching the Galaxy tool catalog for something that was never in it.

A run asked for a plotly chart and searched for 'vintent', 'vintent_dataset', 'plotly'
and 'visualization' in turn. Each search was answered once, so no repeat guard fired;
the catalog simply does not hold OLite tools or visualizations, and never said so.
"""

import asyncio

from olite.drivers.loop.galaxy_tools import _search_tools_by_name
from olite.drivers.loop.tools import ToolSurface
from olite.registry import ProcessRegistry


class _Manifest:
    def allows(self, capability):
        return True


class _Substrate:
    def __init__(self):
        self.manifest = _Manifest()

    def scoped(self, capabilities):
        return self


class _Galaxy:
    def __init__(self, tools=None, plugins=None):
        self.tools = tools or []
        self.plugins = plugins or []
        self.asked = []

    async def get(self, path):
        self.asked.append(path)
        if path.startswith("api/plugins"):
            return self.plugins
        return self.tools


def _surface():
    return ToolSurface(_Substrate(), ProcessRegistry().load_packaged())


def _search(query, tools=None, plugins=None):
    g = _Galaxy(tools, plugins)
    return asyncio.run(_search_tools_by_name(g, {"query": query})), g


def test_searching_for_an_olite_tool_says_where_it_lives_without_directing_a_call():
    """The directive form sent one run to vintent when the user had asked for plotly.

    A search is the model orienting itself, so naming the tool is the answer; telling it to
    call the tool overrides whatever visualization the request actually named.
    """
    outcome = asyncio.run(_surface().dispatch("search_tools_by_name", {"query": "vintent_dataset"}))
    assert outcome.is_error
    assert "is an OLite tool" in outcome.text
    assert "Call vintent_dataset directly" not in outcome.text


def test_asking_to_run_an_olite_tool_by_id_still_names_the_route():
    """A tool_id is the model trying to run that exact tool, so the directive belongs there."""
    outcome = asyncio.run(_surface().dispatch("get_tool_details", {"tool_id": "vintent_dataset"}))
    assert outcome.is_error
    assert "Call vintent_dataset directly" in outcome.text


def test_a_partial_name_still_reaches_the_olite_tool():
    """The run searched 'vintent' before it searched 'vintent_dataset'."""
    outcome = asyncio.run(_surface().dispatch("search_tools_by_name", {"query": "vintent"}))
    assert outcome.is_error and "vintent_dataset" in outcome.text
    assert "directly" not in outcome.text


def test_a_short_query_is_left_to_the_catalog():
    """'lin' must not be read as a reach for lineage_report."""
    surface = _surface()
    assert surface._olite_tool_named({"query": "lin"})[0] is None


def test_an_ordinary_tool_search_is_untouched():
    surface = _surface()
    assert surface._olite_tool_named({"query": "bowtie2"})[0] is None


def test_a_visualization_name_is_answered_with_where_it_lives():
    result, _ = _search("plotly", tools=[], plugins=[{"name": "plotly"}, {"name": "igv"}])
    assert result["tools"] == []
    assert "'plotly' is a visualization" in result["hint"]
    assert "list_visualizations" in result["hint"]


def test_neither_this_agent_nor_the_frozen_plugin_is_named_back():
    result, _ = _search("olite", tools=[], plugins=[{"name": "olite"}])
    assert "visualization" not in result["hint"]


def test_a_search_that_matches_a_real_tool_never_asks_about_plugins():
    result, g = _search("bowtie2", tools=[{"id": "bowtie2"}], plugins=[{"name": "plotly"}])
    assert result == [{"id": "bowtie2"}]
    assert not any(p.startswith("api/plugins") for p in g.asked)


def test_an_empty_search_that_names_nothing_keeps_the_exhausted_answer():
    result, _ = _search("nonesuch", tools=[], plugins=[{"name": "plotly"}])
    assert "No installed Galaxy tool matches this text" in result["hint"]


def test_a_settled_lookup_is_refused_on_the_third_asking():
    """One run searched 'set datatype' nine times, each answer identical.

    The failure guard cannot see this: every call succeeded, so `_last_failure` was
    cleared each time and the count never built.
    """
    surface = _surface()
    args = {"query": "set datatype"}
    assert surface._asking_a_settled_question("search_tools_by_name", args) is None
    assert surface._asking_a_settled_question("search_tools_by_name", args) is None
    refusal = surface._asking_a_settled_question("search_tools_by_name", args)
    assert "already answered" in refusal and "fixed for this session" in refusal


def test_a_different_query_is_its_own_question():
    surface = _surface()
    for q in ("alpha", "beta", "gamma"):
        assert surface._asking_a_settled_question("search_tools_by_name", {"query": q}) is None


def test_polling_a_job_is_never_refused():
    """get_job_details repeats up to ten times in passing runs; its answer does change."""
    surface = _surface()
    for _ in range(12):
        assert surface._asking_a_settled_question("get_job_details", {"dataset_id": "d1"}) is None


def test_writing_a_page_repeatedly_is_never_refused():
    surface = _surface()
    for _ in range(12):
        assert surface._asking_a_settled_question("update_page", {"page_id": "p1"}) is None


def test_a_name_carrying_a_harmony_control_token_still_reaches_its_tool():
    """Observed live: `search_tools_by_keywords<|channel|>commentary` answered "Unknown tool".

    gpt-oss speaks harmony, and an endpoint that does not strip its control tokens leaves
    the channel marker welded to the name. Three of 995 recorded runs lost a step this way.
    """
    surface = _surface()
    assert surface._fold_tool_name("get_page<|channel|>commentary") == "get_page"
    assert surface._fold_tool_name("search_tools_by_name<|channel|>commentary") == "search_tools_by_name"


def test_a_trimmed_name_that_matches_nothing_is_left_unknown():
    """The fold only ever resolves to a tool that is actually advertised."""
    surface = _surface()
    assert surface._fold_tool_name("not_a_tool<|channel|>commentary") is None


def test_an_ordinary_unknown_name_is_untouched():
    surface = _surface()
    assert surface._fold_tool_name("totally_made_up") is None


def test_an_unknown_tool_is_named_without_its_control_token():
    """Echoing the raw name wrote `<|channel|>` into the transcript, and replaying that
    made the endpoint read a message boundary: every later turn answered `Unknown role`.
    """
    outcome = asyncio.run(_surface().dispatch("not_a_tool<|channel|>commentary", {}))
    assert outcome.is_error
    assert "<|" not in outcome.text
    assert "not_a_tool" in outcome.text


def test_a_body_keeps_its_words_while_losing_the_token():
    from olite.drivers.loop.tools import without_control_tokens

    assert without_control_tokens("before<|channel|>final<|message|>after") == "beforefinalafter"
    assert without_control_tokens("nothing to strip") == "nothing to strip"
    assert without_control_tokens(None) is None


def test_the_tool_message_carries_neither_a_contaminated_name_nor_body():
    """The name field poisons the transcript as surely as the content does."""
    from olite.drivers.loop.tools import plain_tool_name, without_control_tokens

    name, body = "get_page<|channel|>commentary", "Unknown tool: get_page<|channel|>commentary"
    message = {"role": "tool", "name": plain_tool_name(name),
               "content": without_control_tokens(body)}
    assert "<|" not in message["name"] and "<|" not in message["content"]
    assert message["name"] == "get_page"
