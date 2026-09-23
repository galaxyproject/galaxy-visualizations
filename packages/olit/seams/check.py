"""Check olit's seams against loom. Exits non-zero when something needs a decision.

Three questions, none of which a person can answer reliably from memory:
  DRIFT   loom's text changed since we last audited this seam
  MISSING the registry names an olit symbol that no longer exists
  ORPHAN  olit emits a prompt block that no seam accounts for

ORPHAN is the one that matters most: it is how an unanchored addition -- text
invented during a port rather than carried from loom -- becomes visible.
"""

import json
import os
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import extract  # noqa: E402
import layers  # noqa: E402

LOOM = pathlib.Path(os.environ.get("LOOM_ROOT", pathlib.Path.home() / "loom"))
ROOT = pathlib.Path(__file__).resolve().parent.parent


def olit_prompt_symbols():
    """Every prompt constant and block builder olit defines.

    Deliberately broader than "what BLOCKS composes": text invented during a port is
    the thing being hunted, and it is just as unanchored sitting in an uncomposed
    constant. Keyed off definitions so it cannot be silently defeated by a refactor.
    """
    text = (ROOT / "brain/olit/prompt.py").read_text()
    consts = re.findall(r'^([A-Z][A-Z_0-9]{2,}) = (?:"""|\'\'\')', text, re.M)
    builders = re.findall(r"^def ([a-z_]+_block)\(", text, re.M)
    return set(consts) | set(builders)


def check_layers(data):
    """The three whole-layer seams. Certified state lives in the registry, so this is offline."""
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
        now = layers.identity_prompt().get("fingerprint")
        if now is None:
            out.append(("MISSING", "layer.identity-prompt",
                        "public/olit.xml has no ai_prompt block"))
        elif now != identity["fingerprint"]:
            out.append(("DRIFT", "layer.identity-prompt",
                        "the prompt Galaxy hands the model changed -- justify it, then re-certify"))

    skills = data.get("skills") or {}
    if skills.get("files"):
        now = layers.skills_manifest()
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

    surface = data.get("tool_surface") or {}
    if surface.get("upstream"):
        allowed = surface.get("allowed_divergence") or {}
        mine = layers.olit_tool_table()
        theirs = surface["upstream"]
        for name in sorted(set(theirs) - set(mine)):
            if name not in allowed:
                out.append(("MISSING", f"layer.tool-surface/{name}",
                            "galaxy-mcp exposes this tool and olit does not"))
        for name in sorted(set(mine) - set(theirs)):
            if name not in allowed:
                out.append(("ORPHAN", f"layer.tool-surface/{name}",
                            "olit exposes a tool galaxy-mcp does not -- label it ADDED"))
        for name in sorted(set(mine) & set(theirs)):
            if mine[name] != theirs[name] and name not in allowed:
                out.append(("DRIFT", f"layer.tool-surface/{name}",
                            "description or parameters differ from galaxy-mcp"))

        # The tables above fingerprint description and parameters, so a tool can match on
        # both and still return something else. get_tool_input_template shipped galaxy-mcp's
        # "ready-to-fill skeleton" wording over a raw schema passthrough for months.
        shaped = surface.get("shaped_returns") or {}
        if shaped:
            passthrough = layers.olit_passthrough_handlers()
            for name in sorted(set(shaped) & passthrough):
                if name in allowed:
                    continue
                keys = ", ".join(shaped[name])
                out.append(("SHAPE", f"layer.tool-return/{name}",
                            f"galaxy-mcp returns {{{keys}}}; olit passes the response through"))
    return out


def main():
    registry = json.loads((ROOT / "seams/registry.json").read_text())["seams"]
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
            text = (ROOT / olit_meta["file"]).read_text()
            if extract.py_symbol(text, olit_meta["symbol"]) is None:
                problems.append(("MISSING", row["id"], f"olit symbol gone: {olit_meta['symbol']}"))

    problems += check_layers(json.loads((ROOT / "seams/registry.json").read_text()).get("layers") or {})

    anchored = {r["olit"]["symbol"] for r in registry if r.get("olit")}
    for row in registry:
        premise = row.get("premise") or {}
        for rel in premise.get("present") or []:
            if not (ROOT / rel).exists():
                problems.append(("PREMISE", row["id"],
                                 f"{rel} is gone; this row's reasoning assumed it: {premise['claim']}"))
        for rel in premise.get("absent") or []:
            if (ROOT / rel).exists():
                problems.append(("PREMISE", row["id"],
                                 f"{rel} now exists; this row's reasoning assumed it would not: "
                                 f"{premise['claim']}"))

    for name in sorted(olit_prompt_symbols() - anchored):
        problems.append(("ORPHAN", f"prompt.{name}",
                         "emitted but not in the registry -- name its loom anchor, or label it ADDED"))

    for kind, seam, detail in problems:
        print(f"{kind:8s} {seam:48s} {detail}")
    data = json.loads((ROOT / "seams/registry.json").read_text()).get("layers") or {}
    counted = (
        len((data.get("eval_scenarios") or {}).get("fingerprints") or {})
        + len((data.get("skills") or {}).get("files") or {})
        + len((data.get("tool_surface") or {}).get("upstream") or {})
        + len((data.get("pi") or {}).get("files") or {})
        + len((data.get("eval_lib") or {}).get("fingerprints") or {})
        + len((data.get("loom_modules") or {}).get("fingerprints") or {})
        + (1 if (data.get("identity_prompt") or {}).get("fingerprint") else 0)
    )
    print(f"\n{len(registry)} seams + {counted} layer entries checked, "
          f"{len(problems)} need attention")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
