"""Skills disclosed the way Orbit discloses them."""

import asyncio
from pathlib import Path

import pytest

from olit.drivers.loop import agent as loop_agent
from olit.drivers.loop.tools import ToolSurface
from olit.registry import SkillEntry, SkillRegistry, parse_frontmatter, select_skills
from olit.registry.skills import SURFACE_ID

SKILL = """---
name: galaxy-transform-collection
description: Transform Galaxy dataset collections reproducibly.
when_to_use: the user asks to filter, sort, relabel, or restructure a collection
metadata:
  surfaces: [loom]
---

# Collections

Use Galaxy's native tools; never build collections ad hoc.
"""

VENDORED = Path(__file__).resolve().parents[1] / "olit" / "registry" / "skills" / "galaxy-skills"
needs_corpus = pytest.mark.skipif(not VENDORED.is_dir(), reason="galaxy-skills not vendored (run npm run build:skills)")


class FakeManifest:
    def allows(self, capability):
        return False


class FakeSubstrate:
    manifest = FakeManifest()


def _corpus(tmp_path, files):
    for path, text in files.items():
        target = tmp_path / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)
    return SkillRegistry().register("galaxy-skills", tmp_path)


# --- Frontmatter, exactly Orbit's keys ----------------------------------------


def test_surfaces_is_read_from_metadata_not_the_top_level():
    """Per the Agent-Skills spec a custom key lives under `metadata`; Orbit reads it there."""
    meta = parse_frontmatter(SKILL)

    assert meta["name"] == "galaxy-transform-collection"
    assert meta["description"].startswith("Transform Galaxy")
    assert meta["when_to_use"].startswith("the user asks")
    assert meta["surfaces"] == ["loom"]

    # A top-level `surfaces:` is NOT the spec, and must not be honoured.
    top_level = parse_frontmatter("---\nname: x\nsurfaces: [loom]\n---\n\nbody")
    assert top_level["surfaces"] == []


def test_unparseable_frontmatter_yields_no_metadata():
    """Real corpus entries carry lines like `argument-hint: [a] [b]`, which is not YAML."""
    assert parse_frontmatter("---\nname: x\nargument-hint: [a] [b]\n---\n\nbody") == {}
    assert parse_frontmatter("no frontmatter at all") == {}


# --- Tag-or-all selection -----------------------------------------------------


def test_tagged_entries_win_but_untagged_survive_when_nothing_is_tagged():
    tagged = SkillEntry("a/SKILL.md", surfaces=[SURFACE_ID])
    untagged = SkillEntry("b/SKILL.md")

    assert select_skills([tagged, untagged]) == [tagged]
    assert select_skills([untagged]) == [untagged]


def test_the_surface_tag_matches_orbits():
    """Retagging would silently change which skills the shipped corpus offers."""
    assert SURFACE_ID == "loom"


# --- The router ---------------------------------------------------------------


def test_the_router_lists_the_fetch_call_and_never_a_body(tmp_path):
    registry = _corpus(tmp_path, {"collection-manipulation/SKILL.md": SKILL})
    router = registry.router_text()

    assert "## Skills repositories (operational know-how)" in router
    assert 'skills_fetch({ path: "collection-manipulation/SKILL.md" })' in router
    assert "When to use: the user asks" in router
    assert "Read the SKILL.md fully before acting on what it teaches." in router
    # The body stays out of the prompt — the whole point of disclosure.
    assert "never build collections ad hoc" not in router


def test_the_router_costs_the_same_whatever_a_skill_weighs(tmp_path, tmp_path_factory):
    """Prompt cost scales with the number of skills, not their size."""
    small = _corpus(tmp_path, {"a/SKILL.md": SKILL}).router_text()
    big_dir = tmp_path_factory.mktemp("big")
    big = _corpus(big_dir, {"a/SKILL.md": SKILL + ("\nfiller.\n" * 2000)}).router_text()

    assert small == big


def test_no_repos_means_no_prompt_section():
    assert SkillRegistry().router_text() == ""


# --- The tool -----------------------------------------------------------------


def test_skills_fetch_is_addressed_by_path_not_by_name(tmp_path):
    """A SKILL.md points at sibling files; a name-keyed tool could not reach them."""
    registry = _corpus(tmp_path, {"a/SKILL.md": SKILL})
    tools = ToolSurface(FakeSubstrate(), None, registry).schemas()
    fetch = next(t for t in tools if t["function"]["name"] == "skills_fetch")

    params = fetch["function"]["parameters"]
    assert params["required"] == ["path"]
    assert params["properties"]["repo"]["enum"] == ["galaxy-skills"]


def test_skills_fetch_returns_a_reference_file_beside_the_skill(tmp_path):
    registry = _corpus(
        tmp_path,
        {"a/SKILL.md": SKILL, "a/references/gotchas.md": "id vs name is the classic trap"},
    )
    surface = ToolSurface(FakeSubstrate(), None, registry)

    result = asyncio.run(surface.dispatch("skills_fetch", {"path": "a/references/gotchas.md"})).text
    assert "classic trap" in result


def test_a_missing_path_reports_an_error_rather_than_nothing(tmp_path):
    surface = ToolSurface(FakeSubstrate(), None, _corpus(tmp_path, {"a/SKILL.md": SKILL}))

    result = asyncio.run(surface.dispatch("skills_fetch", {"path": "a/nope.md"})).text
    assert "Error" in result and "nope.md" in result


def test_traversal_out_of_the_corpus_is_refused(tmp_path):
    (tmp_path.parent / "secret.md").write_text("not part of the corpus")
    surface = ToolSurface(FakeSubstrate(), None, _corpus(tmp_path, {"a/SKILL.md": SKILL}))

    result = asyncio.run(surface.dispatch("skills_fetch", {"path": "../secret.md"})).text
    assert "Error" in result
    assert "not part of the corpus" not in result


# --- Truncation: Orbit has none -----------------------------------------------


def test_tool_results_are_not_truncated(tmp_path):
    """Orbit caps nothing on the way to the model; a severed skill is worse than none."""
    assert not hasattr(loop_agent, "MAX_TOOL_RESULT")

    body = "---\nname: long\nmetadata:\n  surfaces: [loom]\n---\n\n" + ("step. " * 2000)
    surface = ToolSurface(FakeSubstrate(), None, _corpus(tmp_path, {"a/SKILL.md": body}))

    result = asyncio.run(surface.dispatch("skills_fetch", {"path": "a/SKILL.md"})).text
    assert len(result) > 10000
    assert "truncated" not in result


# --- The shipped corpus -------------------------------------------------------


@needs_corpus
def test_the_vendored_corpus_loads_and_is_pinned():
    import json

    stamp = json.loads((VENDORED / "VENDORED.json").read_text())
    assert stamp["repo"] == "galaxyproject/galaxy-skills"
    assert len(stamp["sha"]) == 40

    registry = SkillRegistry().load_packaged()
    assert "galaxy-skills" in registry.names()

    repo = registry.find("galaxy-skills")
    assert len(repo.catalog()) == stamp["skills"]
    assert select_skills(repo.catalog()), "no skill survived surface selection"


@needs_corpus
def test_olit_is_the_default_repo():
    """olit's own skills route to olit's processes; the corpus knows nothing of them."""
    registry = SkillRegistry().load_packaged()
    assert registry.names()[0] == "olit-skills"
    assert registry.find(None).name == "olit-skills"


@needs_corpus
def test_a_real_skill_body_is_reachable_by_its_router_path():
    registry = SkillRegistry().load_packaged()
    entry = select_skills(registry.find("galaxy-skills").catalog())[0]

    body = registry.fetch("galaxy-skills", entry.path)
    assert body and len(body) > 200
