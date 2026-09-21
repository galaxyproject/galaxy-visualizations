"""Destructive Galaxy operations need the user's word before they reach Galaxy."""

import asyncio
import json

from olite.drivers.loop import galaxy_destructive
from olite.drivers.loop.tools import ToolSurface
from olite.substrate import Confirmation
from .fakes import FakeSubstrate


class RecordingGalaxy:
    def __init__(self):
        self.calls = []

    async def get(self, path):
        self.calls.append(("GET", path))
        return {}

    async def put(self, path, body=None):
        self.calls.append(("PUT", path, body))
        return {"id": "h1"}

    async def post(self, path, body=None):
        self.calls.append(("POST", path, body))
        return {"id": "h1"}


def _dispatch(name, args, confirmation=None):
    substrate = FakeSubstrate(galaxy=RecordingGalaxy(), capabilities=("llm", "local", "read", "write"))
    surface = ToolSurface(substrate, confirmation=confirmation)
    return asyncio.run(surface.dispatch(name, args)).text, substrate.galaxy


class Asked:
    """A user who answers every approval the same way, and remembers being asked."""

    def __init__(self, answer):
        self.answer = answer
        self.questions = []
        self.confirmation = Confirmation(ask=self._ask)

    async def _ask(self, payload):
        self.questions.append(json.loads(payload))
        return self.answer


def test_history_delete_is_refused_and_never_reaches_galaxy():
    result, galaxy = _dispatch("update_history", {"history_id": "h1", "deleted": True})

    assert galaxy.calls == []
    assert result.startswith("Refused:")
    assert "h1" in result


def test_purge_wording_says_it_cannot_be_undone():
    result, _ = _dispatch("update_history", {"history_id": "h1", "purged": True})

    assert "cannot be undone" in result


def test_delete_wording_says_whole_history_and_recoverable():
    result, _ = _dispatch("update_history", {"history_id": "h1", "deleted": True})

    assert "entire history" in result
    assert "Recoverable" in result


def test_a_confusable_spelling_cannot_slip_past_the_refusal():
    """The fold re-enters dispatch, so the guard must sit where it sees the folded name."""
    cyrillic = "update_histоry"  # о U+043E
    assert cyrillic != "update_history"
    result, galaxy = _dispatch(cyrillic, {"history_id": "h1", "deleted": True})

    assert galaxy.calls == []
    assert result.startswith("Refused:")


def test_non_destructive_update_still_works():
    result, galaxy = _dispatch("update_history", {"history_id": "h1", "name": "renamed"})

    assert galaxy.calls, "a rename was refused"
    assert not str(result).startswith("Refused:")


def test_deleted_false_is_not_destructive():
    """Only an explicit true. `deleted: false` is an undelete."""
    assert galaxy_destructive.classify("update_history", {"deleted": False}) is None
    assert galaxy_destructive.classify("update_history", {}) is None


def test_classifier_normalizes_the_galaxy_prefix():
    """Orbit's MCP surface prefixes tool names; the bare and prefixed names agree."""
    op = galaxy_destructive.classify("galaxy_update_history", {"deleted": True})
    assert op["kind"] == "history-delete"
    assert op["irreversible"] is False


def test_purge_outranks_delete_when_both_are_set():
    op = galaxy_destructive.classify("update_history", {"deleted": True, "purged": True})
    assert op["kind"] == "history-purge"
    assert op["irreversible"] is True


def test_unrelated_tools_are_not_classified():
    assert galaxy_destructive.classify("create_history", {"history_name": "x"}) is None
    assert galaxy_destructive.classify("run_tool", {"deleted": True}) is None


def test_an_approved_delete_reaches_galaxy():
    """Orbit's local mode confirms and then proceeds; only remote mode blocks outright."""
    user = Asked(answer=True)
    result, galaxy = _dispatch("update_history", {"history_id": "h1", "deleted": True}, user.confirmation)

    assert user.questions, "the user was never asked"
    assert galaxy.calls, "an approved delete never reached Galaxy"
    assert not str(result).startswith("Refused:")


def test_a_declined_delete_does_not_reach_galaxy():
    user = Asked(answer=False)
    result, galaxy = _dispatch("update_history", {"history_id": "h1", "deleted": True}, user.confirmation)

    assert galaxy.calls == []
    assert "declined" in result


def test_the_question_carries_the_honest_headline():
    user = Asked(answer=False)
    _dispatch("update_history", {"history_id": "h1", "purged": True}, user.confirmation)

    (question,) = user.questions
    assert "cannot be undone" in question["message"]
    assert question["title"]


def test_approval_is_never_remembered_between_calls():
    """loom never caches a destructive op; every irreversible action re-prompts."""
    user = Asked(answer=True)
    substrate = FakeSubstrate(galaxy=RecordingGalaxy(), capabilities=("llm", "local", "read", "write"))
    surface = ToolSurface(substrate, confirmation=user.confirmation)

    for _ in range(3):
        asyncio.run(surface.dispatch("update_history", {"history_id": "h1", "deleted": True}))

    assert len(user.questions) == 3


def test_a_non_destructive_call_asks_nothing():
    user = Asked(answer=True)
    _dispatch("update_history", {"history_id": "h1", "name": "renamed"}, user.confirmation)

    assert user.questions == []


def test_a_broken_confirmation_bridge_reads_as_no():
    async def gone(payload):
        raise RuntimeError("worker torn down")

    result, galaxy = _dispatch(
        "update_history", {"history_id": "h1", "deleted": True}, Confirmation(ask=gone)
    )

    assert galaxy.calls == []
    assert result.startswith("Refused:")


def test_a_call_missing_a_required_parameter_is_not_executed():
    """pi validates against the schema before executing; olite validated nothing."""
    result, galaxy = _dispatch("get_history_details", {})

    assert galaxy.calls == []
    assert "missing required parameter" in result
    assert "history_id" in result


def test_validation_names_every_missing_parameter_at_once():
    result, _ = _dispatch("run_tool", {"history_id": "h1"})

    assert "tool_id" in result and "inputs" in result


def test_optional_parameters_are_not_required():
    result, galaxy = _dispatch("get_history_details", {"history_id": "h1"})

    assert galaxy.calls, "a valid call was rejected"
    assert "missing required" not in str(result)


def test_an_unknown_name_is_not_validated_so_the_fold_can_still_reach_it():
    """Validation must not pre-empt the confusables fold with a schema error."""
    cyrillic = "get_histоry_details"  # о U+043E
    result, galaxy = _dispatch(cyrillic, {"history_id": "h1"})

    assert "missing required" not in str(result)
    assert galaxy.calls, "the folded name never reached its handler"


def test_refusal_is_json_free_text_the_model_can_act_on():
    """It must read as a correctable instruction, not as a tool result to parse."""
    result, _ = _dispatch("update_history", {"history_id": "h1", "deleted": True})
    try:
        json.loads(result)
    except json.JSONDecodeError:
        pass
    else:  # pragma: no cover
        raise AssertionError("refusal should not look like a structured result")
    assert "Galaxy interface" in result
