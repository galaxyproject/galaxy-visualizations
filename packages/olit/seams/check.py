"""Check an agent's seams against loom. Exits non-zero when something needs a decision.

Three questions, none of which a person can answer reliably from memory:
  DRIFT   loom's text changed since we last audited this seam
  MISSING the registry names an olit symbol that no longer exists
  ORPHAN  the agent emits a prompt block that no seam accounts for

ORPHAN is the one that matters most: it is how an unanchored addition -- text
invented during a port rather than carried from loom -- becomes visible.

The agent's side of every check is its published description, not its source.
"""

import json
import os
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import description  # noqa: E402
import extract  # noqa: E402
import layers  # noqa: E402

LOOM = pathlib.Path(os.environ.get("LOOM_ROOT", pathlib.Path.home() / "loom"))
HERE = pathlib.Path(__file__).resolve().parent
REGISTRY = HERE / "registry.json"


def check_layers(data, agent):
    """The whole-layer seams. Certified state lives in the registry, so this is offline."""
    out = []
    if not data:
        return out

    scen = (data.get("eval_scenarios") or {}).get("fingerprints") or {}
    if scen and LOOM.exists():
        try:
            now = layers.loom_scenarios(LOOM)
        except OSError:
            now = None
        if now is None:
            out.append(("MISSING", "layer.eval-scenarios", f"loom not readable at {LOOM}"))
        else:
            for name in sorted(set(now) - set(scen)):
                out.append(("DRIFT", f"layer.eval-scenarios/{name}",
                            "loom added a scenario olit has never considered"))
            for name in sorted(set(scen) - set(now)):
                out.append(("DRIFT", f"layer.eval-scenarios/{name}", "loom removed this scenario"))
            for name in sorted(set(scen) & set(now)):
                if scen[name] != now[name]:
                    out.append(("DRIFT", f"layer.eval-scenarios/{name}",
                                "loom changed this scenario -- re-read it, then re-certify"))

    lib = (data.get("eval_lib") or {}).get("fingerprints") or {}
    if lib and LOOM.exists():
        now = layers.loom_eval_lib(LOOM)
        for name in sorted(set(now) - set(lib)):
            out.append(("DRIFT", f"layer.eval-lib/{name}", "loom added grading olit has not seen"))
        for name in sorted(set(lib) - set(now)):
            out.append(("DRIFT", f"layer.eval-lib/{name}", "loom removed this grading module"))
        for name in sorted(set(lib) & set(now)):
            if lib[name] != now[name]:
                out.append(("DRIFT", f"layer.eval-lib/{name}",
                            "loom changed how it grades -- read it, then re-certify"))

    modules = data.get("loom_modules") or {}
    known = modules.get("fingerprints") or {}
    classified = modules.get("classified") or {}
    if known and LOOM.exists():
        now = layers.loom_modules(LOOM)
        for name in sorted(set(now) - set(known)):
            out.append(("DRIFT", f"layer.loom-modules/{name}",
                        "loom added a module -- classify it relevant, NA, or investigate"))
        for name in sorted(set(known) - set(now)):
            out.append(("DRIFT", f"layer.loom-modules/{name}", "loom removed this module"))
        for name in sorted(set(known) & set(now)):
            if known[name] != now[name]:
                out.append(("DRIFT", f"layer.loom-modules/{name}",
                            f"changed upstream ({classified.get(name, 'unclassified')}) -- "
                            "re-read it, then re-certify"))
        for name in sorted(set(now) - set(classified)):
            out.append(("ORPHAN", f"layer.loom-modules/{name}", "fingerprinted but not classified"))

    identity = data.get("identity_prompt") or {}
    if identity.get("fingerprint"):
        now = (agent.get("identity_prompt") or {}).get("fingerprint")
        if now is None:
            out.append(("MISSING", "layer.identity-prompt",
                        "the agent publishes no identity prompt"))
        elif now != identity["fingerprint"]:
            out.append(("DRIFT", "layer.identity-prompt",
                        "the prompt Galaxy hands the model changed -- justify it, then re-certify"))

    skills = data.get("skills") or {}
    if skills.get("files"):
        now = agent["skills"]
        # The pin is committed, so it is checkable anywhere.
        if now["sha"] != skills["sha"]:
            out.append(("DRIFT", "layer.skills",
                        f"vendored pin moved {skills['sha'][:12]} -> {now['sha'][:12]}"))
        # The corpus itself is a build artifact. An unbuilt checkout has nothing to compare,
        # which is not the same as a corpus that was edited or deleted.
        if not now["vendored"]:
            print("note: skills corpus not vendored (run `npm run build:skills`) — "
                  "pin checked, file contents not\n")
        else:
            for f in sorted(set(skills["files"]) ^ set(now["files"])):
                out.append(("DRIFT", f"layer.skills/{f}", "vendored file added or removed"))
            for f in sorted(set(skills["files"]) & set(now["files"])):
                if skills["files"][f] != now["files"][f]:
                    out.append(("DRIFT", f"layer.skills/{f}", "vendored content edited locally"))

    pi = data.get("pi") or {}
    if pi.get("files") and LOOM.exists():
        now = layers.pi_manifest(LOOM)
        if now is None:
            out.append(("MISSING", "layer.pi", "pi-agent-core not installed under loom"))
        else:
            if now["version"] != pi["version"]:
                out.append(("DRIFT", "layer.pi",
                            f"pi moved {pi['version']} -> {now['version']} — re-audit the loop"))
            for f in sorted(set(pi["files"]) | set(now["files"])):
                a, b = pi["files"].get(f), now["files"].get(f)
                if a != b:
                    out.append(("DRIFT", f"layer.pi/{f.split('/')[-1]}",
                                "the loop olit ports has changed upstream"))

    out.extend(_policy_rows(data.get("policy") or {}, agent))
    out.extend(_map_rows("tool-request", data.get("tool_request") or {}, description.tool_requests(agent),
                         "the Galaxy query this tool builds has changed"))
    out.extend(_map_rows("tool-contract", data.get("tool_contract") or {}, description.tool_contracts(agent),
                         "the parameter contract the model is shown has changed"))

    surface = data.get("tool_surface") or {}
    if surface.get("upstream"):
        allowed = surface.get("allowed_divergence") or {}
        mine = description.tool_table(agent)
        theirs = surface["upstream"]
        for name in sorted(set(theirs) - set(mine)):
            if name not in allowed:
                out.append(("MISSING", f"layer.tool-surface/{name}",
                            "galaxy-mcp exposes this tool and the agent does not"))
        for name in sorted(set(mine) - set(theirs)):
            if name not in allowed:
                out.append(("ORPHAN", f"layer.tool-surface/{name}",
                            "the agent exposes a tool galaxy-mcp does not -- label it ADDED"))
        for name in sorted(set(mine) & set(theirs)):
            if mine[name] != theirs[name] and name not in allowed:
                out.append(("DRIFT", f"layer.tool-surface/{name}",
                            "description or parameters differ from galaxy-mcp"))

        # The tables above fingerprint description and parameters, so a tool can match on
        # both and still return something else. get_tool_input_template shipped galaxy-mcp's
        # "ready-to-fill skeleton" wording over a raw schema passthrough for months.
        shaped = surface.get("shaped_returns") or {}
        if shaped:
            passthrough = description.passthrough_handlers(agent)
            for name in sorted(set(shaped) & passthrough):
                if name in allowed:
                    continue
                keys = ", ".join(shaped[name])
                out.append(("SHAPE", f"layer.tool-return/{name}",
                            f"galaxy-mcp returns {{{keys}}}; the agent passes the response through"))
    return out


def _describe(stored, live):
    """Name what moved, so a reader does not have to diff two blobs."""
    if not isinstance(stored, dict) or not isinstance(live, dict):
        return f"{stored!r} -> {live!r}"
    moved = [f"{k}: {stored.get(k)!r} -> {live.get(k)!r}"
             for k in sorted(set(stored) | set(live)) if stored.get(k) != live.get(k)]
    return "; ".join(moved)


def _map_rows(kind, stored, live, message):
    """Per-entry drift between what the registry declares and what the code does now."""
    rows = []
    for name in sorted(set(stored) | set(live)):
        if name not in live:
            rows.append(("MISSING", f"layer.{kind}/{name}", "declared here but gone from the code"))
        elif name not in stored:
            rows.append(("ORPHAN", f"layer.{kind}/{name}", "not declared -- re-snapshot to record it"))
        elif stored[name] != live[name]:
            rows.append(("DRIFT", f"layer.{kind}/{name}",
                         f"{message}: {_describe(stored[name], live[name])}"))
    return rows


def _policy_rows(policy, agent):
    """Declared behaviour against live behaviour, and a PORTED value against pi's."""
    rows = []
    for name, declared in sorted(policy.items()):
        live = description.policy(agent, name)
        stored = declared.get("olit")
        if stored != live:
            rows.append(("DRIFT", f"policy.{name}",
                         f"the code no longer matches what is declared: {_describe(stored, live)}"))
        upstream = (declared.get("upstream") or {})
        labels = declared.get("labels") or {}
        if declared.get("label") == "PORTED":
            for key, value in upstream.items():
                if isinstance(stored, dict) and stored.get(key) != value:
                    rows.append(("DRIFT", f"policy.{name}/{key}",
                                 f"declared PORTED but pi has {value!r} and olit has {stored.get(key)!r}"))
        for key, label in sorted(labels.items()):
            if label == "PORTED" and isinstance(stored, dict) and stored.get(key) != upstream.get(key):
                rows.append(("DRIFT", f"policy.{name}/{key}",
                             f"declared PORTED but pi has {upstream.get(key)!r} and olit has {stored.get(key)!r}"))
    return rows


def main():
    stored = json.loads(REGISTRY.read_text())
    registry = stored["seams"]
    agent = description.load()
    problems = []
    # CI has no loom checkout. The upstream-drift rows need one; everything that compares
    # olit against state already recorded in the registry does not, and those are the
    # checks that catch *our* mistakes rather than Orbit's movement.
    have_loom = LOOM.exists()
    if not have_loom:
        print(f"note: no loom at {LOOM} — upstream drift not checked; "
              f"orphan, skills and tool-surface checks still run\n")

    for row in registry:
        loom_meta = row.get("loom") if have_loom else None
        if loom_meta:
            path = LOOM / loom_meta["file"]
            if not path.exists():
                problems.append(("MISSING", row["id"], f"loom file absent: {loom_meta['file']}"))
                continue
            text = path.read_text()
            src = extract.ts_symbol(text, loom_meta["symbol"])
            if src is None:
                src = extract.ts_const(text, loom_meta["symbol"])
            if src is not None and loom_meta.get("section"):
                src = extract.section(src, loom_meta["section"])
            if src is None:
                problems.append(("MISSING", row["id"], f"loom symbol gone: {loom_meta['symbol']}"))
            elif extract.fingerprint(src) != loom_meta["fingerprint"]:
                problems.append(("DRIFT", row["id"],
                                 f"{loom_meta['symbol']} changed upstream -- re-audit, then re-record"))
        olit_meta = row.get("olit")
        if olit_meta:
            if not description.defines(agent, olit_meta["file"], olit_meta["symbol"]):
                problems.append(("MISSING", row["id"],
                                 f"{agent['agent']} symbol gone: {olit_meta['symbol']}"))

    problems += check_layers(stored.get("layers") or {}, agent)

    anchored = {r["olit"]["symbol"] for r in registry if r.get("olit")}
    for name in sorted(set(agent["prompt_blocks"]) - anchored):
        problems.append(("ORPHAN", f"prompt.{name}",
                         "emitted but not in the registry -- name its loom anchor, or label it ADDED"))

    for kind, seam, detail in problems:
        print(f"{kind:8s} {seam:48s} {detail}")
    data = stored.get("layers") or {}
    counted = (
        len((data.get("eval_scenarios") or {}).get("fingerprints") or {})
        + len((data.get("skills") or {}).get("files") or {})
        + len((data.get("tool_surface") or {}).get("upstream") or {})
        + len((data.get("pi") or {}).get("files") or {})
        + len((data.get("eval_lib") or {}).get("fingerprints") or {})
        + len((data.get("loom_modules") or {}).get("fingerprints") or {})
        + (1 if (data.get("identity_prompt") or {}).get("fingerprint") else 0)
        + len(data.get("policy") or {})
        + len(data.get("tool_request") or {})
        + len(data.get("tool_contract") or {})
    )
    print(f"\n{len(registry)} seams + {counted} layer entries checked, "
          f"{len(problems)} need attention")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
