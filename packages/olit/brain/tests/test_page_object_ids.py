"""A page may not name a Galaxy object by anything but its encoded id.

Galaxy's directive validation checks that an argument's *name* is allowed and never looks
at the value, and the `visualization` directive takes DynamicArguments, so it validates
nothing at all. `visualization_id=plotly` is stored and the embed renders nothing.
"""

import asyncio

import pytest

from olit.drivers.loop.galaxy_tools import _update_page
from olit.drivers.loop.outcome import ToolOutcome
from olit.drivers.loop.page_edit import malformed_object_ids

REAL = "a8539f6d9115ffe7"
ALSO_REAL = "0c97fda4aafcf418"


class FakeGalaxy:
    def __init__(self):
        self.put = self._put
        self.puts = []

    async def get(self, path):
        return {"content_editor": "## Record\n"}

    async def _put(self, path, payload):
        self.puts.append((path, payload))
        return {"id": "p1", "content_editor": payload.get("content", "")}


def run(coro):
    return asyncio.run(coro)


def write(content, **extra):
    g = FakeGalaxy()
    out = run(_update_page(g, {"page_id": "p1", "content": content, **extra}))
    return g, out


# --- what the validator sees ------------------------------------------------------------


def test_a_plugin_name_where_an_id_belongs_is_malformed():
    assert malformed_object_ids("visualization(visualization_id=plotly)") == ["visualization_id=plotly"]


def test_an_encoded_id_is_accepted():
    assert malformed_object_ids(f"visualization(visualization_id={REAL})") == []


def test_a_good_and_a_bad_argument_in_one_directive_are_told_apart():
    bad = malformed_object_ids(f"visualization(visualization_id=plotly, history_dataset_id={ALSO_REAL})")
    assert bad == ["visualization_id=plotly"]


def test_each_object_argument_is_checked():
    for name in ("visualization_id", "history_dataset_id", "history_dataset_collection_id"):
        assert malformed_object_ids(f"x({name}=nope)") == [f"{name}=nope"]


def test_other_arguments_are_left_to_galaxy():
    """Not general directive validation: only the three that name an object."""
    assert malformed_object_ids('history_dataset_display(output="trimmed reads", hid=3)') == []


def test_a_quoted_id_is_read_through_its_quotes():
    assert malformed_object_ids(f'visualization(visualization_id="{REAL}")') == []


def test_a_page_with_no_directives_is_untouched():
    assert malformed_object_ids("## Record\n\nJust prose.") == []


# --- what the tool does with it ----------------------------------------------------------


def test_writing_a_malformed_id_is_refused_before_galaxy_sees_it():
    g, out = write("## Record\n\n```galaxy\nvisualization(visualization_id=plotly)\n```")

    assert isinstance(out, ToolOutcome) and out.refused
    assert out.guard == "malformed-object-id"
    assert g.puts == [], "nothing may reach Galaxy"


def test_the_refusal_points_at_the_artifact_token():
    _, out = write("```galaxy\nvisualization(visualization_id=plotly)\n```")

    assert "{{artifact}}" in out.content["error"]
    assert "visualization_id=plotly" in out.content["error"]


def test_an_encoded_id_written_by_hand_still_works():
    """A dataset id from get_history_contents is legitimate; this is not membership-based."""
    g, out = write(f"```galaxy\nhistory_dataset_display(history_dataset_id={ALSO_REAL})\n```")

    assert not isinstance(out, ToolOutcome)
    assert g.puts and g.puts[0][1]["content"].endswith("```")


def test_the_resolved_artifact_path_is_unaffected():
    """`{{artifact}}` is expanded before the handler runs, so what arrives is a real id."""
    g, out = write(f"```galaxy\nvisualization(visualization_id={REAL}, history_dataset_id={ALSO_REAL})\n```")

    assert not isinstance(out, ToolOutcome) and g.puts


def test_a_section_edit_is_checked_too():
    g, out = write(None, section_heading="## Chart", section_content="visualization(visualization_id=plotly)")

    assert isinstance(out, ToolOutcome) and out.refused


@pytest.mark.parametrize("value", ["plotly", "nope", "0c97fda4aafcf41", "0c97fda4aafcf4188", "ZZZZZZZZZZZZZZZZ"])
def test_anything_that_is_not_sixteen_hex_is_refused(value):
    assert malformed_object_ids(f"visualization(visualization_id={value})")
