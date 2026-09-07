"""Per-process least privilege: a process runs under its own declared manifest."""

import asyncio
import json

import pytest

from olite.drivers.loop.tools import ToolSurface
from olite.registry import ProcessRegistry
from olite.exceptions import CapabilityError
from olite.substrate.manifest import DEFAULT_CAPABILITIES, CapabilityManifest
from olite.substrate.substrate import Substrate

CONFIG = {"galaxy_root": "http://galaxy.test", "capabilities": ["llm", "local", "read", "write"]}


# --- The manifest algebra ----------------------------------------------------


def test_absent_capabilities_take_the_default_but_an_empty_list_grants_nothing():
    """None is 'unspecified'; [] is 'nothing'. Collapsing them would invert the gate."""
    assert CapabilityManifest().granted == set(DEFAULT_CAPABILITIES)
    assert CapabilityManifest(None).granted == set(DEFAULT_CAPABILITIES)
    assert CapabilityManifest([]).granted == set()


def test_intersect_narrows_and_cannot_escalate():
    session = CapabilityManifest(["llm", "local", "read"])

    assert session.intersect(["read"]).granted == {"read"}
    # A declaration asking for more than the session holds gains nothing.
    assert session.intersect(["read", "write", "admin"]).granted == {"read"}
    # Declaring nothing inherits the session unchanged.
    assert session.intersect(None).granted == session.granted


def test_intersect_does_not_mutate_the_session_manifest():
    session = CapabilityManifest(["llm", "read", "write"])
    session.intersect([])
    assert session.granted == {"llm", "read", "write"}


# --- The substrate view ------------------------------------------------------


def test_scoped_substrate_denies_what_the_declaration_dropped():
    substrate = Substrate(CONFIG)
    assert substrate.manifest.allows("write")

    view = substrate.scoped(["llm", "read"])

    assert view.manifest.allows("read")
    assert not view.manifest.allows("write")
    assert not view.manifest.allows("local")
    # Every service in the view answers to the narrowed manifest.
    for service in (view.local, view.llm, view.galaxy, view.catalog):
        manifest = getattr(service, "manifest", None) or getattr(service, "_manifest")
        assert manifest is view.manifest


def test_scoping_leaves_the_parent_session_untouched():
    substrate = Substrate(CONFIG)
    substrate.scoped([])

    assert substrate.manifest.allows("write")
    assert substrate.galaxy.manifest.allows("write")


def test_a_scoped_write_is_refused_at_the_call():
    """The gate, not just the flag: GalaxyHttp.post must raise under a read-only view."""
    view = Substrate(CONFIG).scoped(["llm", "read"])

    with pytest.raises(CapabilityError):
        asyncio.run(view.galaxy.post("api/tools", {}))


def test_a_view_shares_state_rather_than_resetting_it():
    """Rebuilding services would wipe the namespace and hand out a fresh rate budget."""
    substrate = Substrate(CONFIG)
    substrate.local.run("x = 41")

    view = substrate.scoped(["llm", "local", "read"])

    # Same interpreter namespace, not a fresh one.
    assert view.local.run("x + 1") == "42"
    # One rate limiter per session, shared by every scoped view.
    assert view.llm._limiter is substrate.llm._limiter
    # Same loaded spec, so scoping costs no network round trip.
    assert view.catalog._providers is substrate.catalog._providers


# --- End to end through a process tool ------------------------------------------


class RecordingSubstrate(Substrate):
    """A real Substrate whose scoping is observable, over a stub catalog."""

    def __init__(self, config):
        super().__init__(config)
        self.scoped_with = []

    def scoped(self, capabilities):
        self.scoped_with.append(capabilities)
        return super().scoped(capabilities)


def _capability_probe_graph():
    """A one-node graph whose executor tries a write op through the catalog."""
    return {
        "version": 1,
        "id": "probe",
        "kind": "agent_pipeline",
        "start": "write",
        "nodes": {
            "write": {
                "type": "executor",
                "run": {"op": "api.call", "target": "galaxy.tools.post", "input": {}},
                "emit": {"state.out": "result"},
                "next": "done",
            },
            "done": {"type": "terminal", "output": {"out": {"$ref": "state.out"}}},
        },
    }


def test_a_read_only_process_cannot_write_from_a_write_enabled_session():
    """The property the thesis claims, stated as a test."""
    substrate = RecordingSubstrate(CONFIG)
    assert substrate.manifest.allows("write"), "session is deliberately write-enabled"

    processes = ProcessRegistry()
    processes.register("probe", _capability_probe_graph(), capabilities=["llm", "read"])
    surface = ToolSurface(substrate, processes)

    raw = asyncio.run(surface.dispatch("probe", {})).text

    assert substrate.scoped_with == [["llm", "read"]]
    # The catalog refuses the write op rather than performing it.
    assert "capability_denied" in raw or "catalog_unavailable" in raw, raw
    assert json.loads(raw).get("ok") is not True


def test_the_packaged_processes_declare_least_privilege():
    """Both shipped processes are pure reads; neither should carry write."""
    registry = ProcessRegistry().load_packaged()

    for name in ("vintent_dataset", "lineage_report"):
        declared = registry.get(name).capabilities
        assert declared is not None, f"{name} declares no manifest"
        assert "write" not in declared
        assert "read" in declared
