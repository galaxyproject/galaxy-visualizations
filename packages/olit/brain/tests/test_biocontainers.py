"""Resolving a container image: galaxy-mcp's answer shape, quay.io's tag reality."""

import json

import pytest

from olit.drivers.loop import biocontainers
from olit.drivers.loop.biocontainers import parse_packages, pick_tag, recommend

# What galaxy-mcp's _shape_biocontainer_recommendation returns, so an agent reads the same
# fields whichever server answered.
CONTRACT = {"image", "found", "match_quality", "source", "notes", "verified"}
QUALITIES = {"exact_version", "name_only", "not_found"}


def tag(name, ts):
    return {"name": name, "start_ts": ts}


class FakeHttp:
    def __init__(self, tags=None, status=200):
        self.body = json.dumps({"tags": tags or []})
        self.status = status
        self.urls = []

    async def request(self, method, url, **kw):
        self.urls.append(url)
        return type("Response", (), {"status": self.status, "text": self.body})()


@pytest.fixture
def quay(monkeypatch):
    def install(tags=None, status=200):
        fake = FakeHttp(tags, status)
        monkeypatch.setattr(biocontainers, "http", fake)
        return fake

    return install


# --- the request shape galaxy-mcp validates before touching the network ------------------


def test_a_bare_name_and_a_pinned_version_both_parse():
    assert parse_packages(["pandas", "samtools=1.17"]) == [("pandas", None), ("samtools", "1.17")]


def test_an_empty_list_is_refused():
    with pytest.raises(ValueError, match="at least one"):
        parse_packages([])


def test_an_entry_without_a_name_is_refused():
    with pytest.raises(ValueError, match="invalid package entry"):
        parse_packages(["=1.17"])


# --- picking a tag, which is the part that must not be invented -------------------------


def test_a_pinned_version_matches_its_build_suffix():
    tags = [tag("2.2.1", 10), tag("2.2.1--pyhd8ed1ab_1", 20), tag("1.5.2", 5)]
    assert pick_tag(tags, "2.2.1") == ("2.2.1--pyhd8ed1ab_1", "exact_version")


def test_a_version_with_no_built_tag_falls_back_to_the_newest():
    tags = [tag("1.5.2", 5), tag("2.2.1", 30)]
    assert pick_tag(tags, "9.9.9") == ("2.2.1", "name_only")


def test_no_pinned_version_takes_the_newest_built_tag():
    assert pick_tag([tag("1.5.2", 5), tag("2.2.1", 30)], None) == ("2.2.1", "name_only")


def test_the_newest_is_chosen_by_timestamp_not_by_position():
    assert pick_tag([tag("old", 99), tag("newer", 100)], None)[0] == "newer"


def test_an_empty_listing_resolves_to_nothing():
    assert pick_tag([], "1.0") == (None, "not_found")


# --- the answer, in galaxy-mcp's shape ---------------------------------------------------


@pytest.mark.asyncio
async def test_a_resolved_image_reports_the_tag_the_registry_serves(quay):
    quay([tag("2.2.1--pyhd8ed1ab_1", 20)])
    out = await recommend(["pandas=2.2.1"])
    assert set(out) == CONTRACT
    assert out["image"] == "quay.io/biocontainers/pandas:2.2.1--pyhd8ed1ab_1"
    assert out["found"] and out["verified"] is True
    assert out["match_quality"] == "exact_version" and not out["notes"]


@pytest.mark.asyncio
async def test_a_substituted_tag_says_so_rather_than_passing_silently(quay):
    quay([tag("2.2.1", 20)])
    out = await recommend(["pandas=9.9.9"])
    assert out["match_quality"] == "name_only"
    assert "9.9.9" in out["notes"][0]


@pytest.mark.asyncio
async def test_several_packages_answer_not_found_instead_of_guessing_a_mulled_hash(quay):
    fake = quay([tag("1.0", 1)])
    out = await recommend(["samtools=1.17", "bwa"])
    assert out["found"] is False and out["image"] is None
    assert out["match_quality"] == "not_found"
    assert "mulled-v2" in out["notes"][0]
    assert fake.urls == [], "a multi-package request must not reach the registry"


@pytest.mark.asyncio
async def test_an_unknown_package_is_reported_not_invented(quay):
    quay(status=404)
    out = await recommend(["nosuchpackage"])
    assert out["found"] is False and out["image"] is None
    assert out["verified"] is None


@pytest.mark.asyncio
async def test_every_answer_uses_a_quality_galaxy_mcp_declares(quay):
    quay([tag("1.0", 1)])
    for packages in (["pandas"], ["pandas=1.0"], ["a", "b"]):
        out = await recommend(packages)
        assert out["match_quality"] in QUALITIES
        assert set(out) == CONTRACT


@pytest.mark.asyncio
async def test_a_package_name_is_escaped_into_the_url(quay):
    fake = quay([tag("1.0", 1)])
    await recommend(["r-ggplot2"])
    assert "biocontainers/r-ggplot2/tag/" in fake.urls[0]


def test_the_newest_tag_is_the_highest_version_not_the_most_recent_build():
    """Quay rebuilds old tags: `pandas` resolved to 0.23.4 from 2018 when ranked by time."""
    tags = [tag("0.23.4--py36hf8a1672_0", 1719914447), tag("2.2.1", 1716355000)]
    assert pick_tag(tags, None) == ("2.2.1", "name_only")


def test_builds_of_one_version_are_ordered_by_build_time():
    tags = [tag("1.17--hd87286a_1", 10), tag("1.17--hd87286a_2", 20)]
    assert pick_tag(tags, "1.17") == ("1.17--hd87286a_2", "exact_version")


def test_a_tag_without_a_leading_version_never_outranks_one_with():
    assert pick_tag([tag("latest", 999), tag("1.0", 1)], None)[0] == "1.0"


@pytest.mark.asyncio
async def test_a_registry_that_refuses_resolves_to_nothing(monkeypatch):
    """Quay answers 401 for an unknown repository, so a refusal cannot mean 'guess'."""

    class Refusing:
        async def request(self, method, url, **kw):
            raise RuntimeError("HTTP 401: UNAUTHORIZED")

    monkeypatch.setattr(biocontainers, "http", Refusing())
    out = await recommend(["nosuchpackage"])
    assert out["found"] is False and out["image"] is None and out["verified"] is None
    assert "did not answer" in out["notes"][0]
