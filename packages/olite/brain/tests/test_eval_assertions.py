"""Numeric assertions must survive a model's thousands separators."""

import pathlib
import sys

EVALS = pathlib.Path(__file__).resolve().parents[2] / "evals"
sys.path.insert(0, str(EVALS))

from lib.assertions import _grouped_forms  # noqa: E402


def test_a_number_matches_however_the_model_groups_it():
    forms = _grouped_forms("96000")
    for written in ("96000", "96,000", "96 000", "96\u00a0000", "96\u202f000", "96_000", "96.000"):
        assert any(f == written for f in forms), written


def test_unrelated_text_is_not_rewritten():
    # the old approach joined "chr1 100" into "chr1100"; needle variants cannot.
    assert _grouped_forms("chr1") == ["chr1"]
    assert _grouped_forms("60") == ["60"]


def test_longer_numbers_group_in_threes():
    assert "1,000,000" in _grouped_forms("1000000")


def test_not_empty_fails_a_page_that_is_actually_empty():
    """The original check only looked for the starter text, so `""` passed it."""
    from lib.assertions import _record

    class FakeGalaxy:
        def __init__(self, content):
            self._content = content

        def call(self, path):
            if path == "api/pages":
                return [{"id": "p1", "slug": "olite-h1"}]
            return {"content": "", "content_editor": self._content}

    class Run:
        def __init__(self, content):
            self.staged = {"galaxy": FakeGalaxy(content), "history_id": "h1"}

    def grade(content):
        failures, _ = [], set()
        _record({"notEmpty": True}, Run(content), failures, set())
        return [f.assertion for f in failures]

    from olite.drivers.loop.notebook import STARTER

    assert grade("") == ["record.notEmpty"]
    assert grade("   \n ") == ["record.notEmpty"]
    # the starter alone is not a written record
    assert grade(STARTER) == ["record.notEmpty"]
    assert grade("## Record\n\nRan Grouping1; mean Glucose 141.3") == []


def test_not_empty_accepts_content_appended_below_the_starter():
    """The agent had written; it just left the placeholder above its entry."""
    from lib.assertions import _record
    from olite.drivers.loop.notebook import STARTER

    class FakeGalaxy:
        def __init__(self, content): self._c = content
        def call(self, path):
            if path == "api/pages":
                return [{"id": "p1", "slug": "olite-h1"}]
            return {"content": "", "content_editor": self._c}

    class Run:
        def __init__(self, content):
            self.staged = {"galaxy": FakeGalaxy(content), "history_id": "h1"}

    def grade(content):
        failures = []
        _record({"notEmpty": True}, Run(content), failures, set())
        return [f.assertion for f in failures]

    assert grade(STARTER) == ["record.notEmpty"]
    # a line the agent added counts, wherever it sits relative to the starter
    assert grade(STARTER + "\n## Findings\n\nmean Glucose 141.3\n") == []
    assert grade("## Findings\n\nmean Glucose 141.3\n\n" + STARTER) == []
    # a starter line quoted inside real content must not subtract from it
    assert grade(STARTER + "\n## Record\n") == ["record.notEmpty"]
    assert grade(STARTER + "\n## Record\n\nRan Grouping1\n") == []
