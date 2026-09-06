#!/usr/bin/env python3
"""Scenario-driven evals for olite. Ported from loom's `evals/run.ts`."""

import argparse
import json
import logging
import os
import sys
import time

# The brain logs every tool call and a parse warning for a corpus SKILL.md whose
logging.basicConfig(level=logging.ERROR)
logging.getLogger("olite").setLevel(logging.ERROR)

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "brain"))
sys.path.insert(0, HERE)

from lib.assertions import DIMENSIONS, evaluate, validate_patterns  # noqa: E402
from lib.harness import load_scenarios, run_scenario  # noqa: E402
from lib import loom_scenarios  # noqa: E402


# HTTP 429 means out of budget, not a behavioural failure; graded separately.
QUOTA_STATUS = 429


def is_quota(row):
    """True when a result was rate-limited. `row` is a result dict or a RunResult."""
    status = row.get("statusCode") if isinstance(row, dict) else getattr(row, "status_code", None)
    return status == QUOTA_STATUS


def available_models(matrix, only):
    usable, skipped = [], []
    for model in matrix["models"]:
        if only and only not in model["id"]:
            continue
        missing = [v for v in model.get("envRequires", []) if not os.environ.get(v)]
        (skipped if missing else usable).append((model, missing))
    return [m for m, _ in usable], skipped


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("scenario", nargs="?", help="substring filter on scenario directory")
    ap.add_argument("--model", help="substring filter on model id")
    ap.add_argument("--json", dest="json_out", help="write raw results here")
    ap.add_argument("--delay", type=float, default=0.0,
                    help="extra seconds between runs; the provider's own rate limit already applies")
    ap.add_argument("--repeat", type=int, default=0, metavar="N",
                    help="override the run count; scenarios shared with loom carry their own")
    ap.add_argument("--loom", default=os.environ.get("LOOM_SCENARIOS", os.path.expanduser("~/loom/evals/scenarios")),
                    help="loom's scenario directory, the source of truth for shared scenarios")
    ap.add_argument("--only-local", action="store_true", help="skip the scenarios shared with loom")
    args = ap.parse_args()

    with open(os.path.join(HERE, "models.json")) as f:
        matrix = json.load(f)
    scenarios = load_scenarios(os.path.join(HERE, "scenarios"), args.scenario)
    if not args.only_local:
        shared = loom_scenarios.load(args.loom, args.scenario)
        if not shared:
            print(f"  note: no shared scenarios; loom not found at {args.loom}")
        scenarios = shared + scenarios
    models, skipped = available_models(matrix, args.model)

    for model, missing in skipped:
        print(f"  skip {model['id']}: needs {', '.join(missing)}")
    if not models:
        print("\nNo runnable models. Set the env vars above, or see evals/README.md.")
        return 1
    if not scenarios:
        print("\nNo scenarios matched.")
        return 1

    bad_patterns = validate_patterns(scenarios)
    if bad_patterns:
        print("\nUnparseable assertion patterns:")
        for problem in bad_patterns:
            print(f"  {problem}")
        return 1

    repeat = max(1, args.repeat) if args.repeat else 0
    times = f" x {repeat} run(s)" if repeat > 1 else " x per-scenario runs"
    print(f"\n{len(scenarios)} scenario(s) x {len(models)} model(s){times}\n")
    results = []
    for model in models:
        for scenario in scenarios:
          runs = repeat or max(1, int(scenario.get("runs") or 1))
          for run_index in range(runs):
              if args.delay and results:
                  time.sleep(args.delay)
              run = run_scenario(scenario, model)
              if run.error:
                  failures, exercised = [], set()
                  verdict = "quota" if is_quota(run) else "ERROR"
                  note = run.error.replace("\n", " ")
              else:
                  failures, exercised = evaluate(scenario, run)
                  verdict = "pass" if not failures else "FAIL"
                  note = "" if not failures else failures[0].detail
              # Flushed per result: a full matrix runs for many minutes, and Python
              tag = f" #{run_index + 1}" if runs > 1 else ""
              print(f"  [{verdict:5s}] {model['id']:24s} {scenario['id']:34s}{tag} {note[:60]}", flush=True)
              for f in failures[1:]:
                  print(f"          {f}")
              results.append(
                  {
                      "model": model["id"],
                      "scenario": scenario["id"],
                      "run": run_index + 1,
                      "error": run.error,
                      "statusCode": run.status_code,
                      "dimensions": sorted(exercised),
                      "failures": [
                          {"assertion": f.assertion, "detail": f.detail, "dimension": f.dimension} for f in failures
                      ],
                      "toolsCalled": run.tools_called,
                      # A pass is the artifact worth keeping, not just the verdict.
                      "chatText": run.chat_text if run.messages else "",
                      "messages": run.messages or [],
                      "logs": run.logs or [],
                  }
              )


    print_leaderboard(results, models)
    print_instability(results)
    if args.json_out:
        with open(args.json_out, "w") as f:
            json.dump(results, f, indent=2)
        print(f"\nraw results -> {args.json_out}")
    # A quota-limited run is not a failure of the agent, so it must not fail the suite.
    graded = [r for r in results if not is_quota(r)]
    return 0 if all(not r["failures"] and not r["error"] for r in graded) else 1


def outcome(row):
    """One word per run, so repeated runs can be compared."""
    if row["error"]:
        return "quota" if is_quota(row) else "ERROR"
    return "pass" if not row["failures"] else "FAIL"


def print_instability(results):
    """Name the tuples whose runs disagreed. A flaky cell is a finding, not noise."""
    grouped = {}
    for row in results:
        grouped.setdefault((row["model"], row["scenario"]), []).append(outcome(row))
    unstable = {k: v for k, v in grouped.items() if len(v) > 1 and len(set(v)) > 1}
    if not unstable:
        return
    print("\nUnstable — the same scenario went both ways on repeated runs:")
    for (model, scenario), outcomes in sorted(unstable.items()):
        tally = ", ".join(f"{o}x{outcomes.count(o)}" for o in dict.fromkeys(outcomes))
        print(f"  {model:24s} {scenario:34s} {tally}")
    print("A cell that is not unanimous cannot be reported as a single verdict.")


def print_leaderboard(results, models):
    """Per-model score on each dimension: exercised runs that produced no failure."""
    print(f"\n{'model':24s} " + " ".join(f"{d:>10s}" for d in DIMENSIONS) + f" {'errors':>7s} {'quota':>6s}")
    print("-" * (24 + 11 * len(DIMENSIONS) + 15))
    for model in models:
        rows = [r for r in results if r["model"] == model["id"]]
        cells = []
        for dim in DIMENSIONS:
            exercised = [r for r in rows if dim in r["dimensions"]]
            if not exercised:
                cells.append(f"{'-':>10s}")
                continue
            clean = [r for r in exercised if not any(f["dimension"] == dim for f in r["failures"])]
            cells.append(f"{len(clean)}/{len(exercised):<8d}")
        errors = sum(1 for r in rows if r["error"] and not is_quota(r))
        quota = sum(1 for r in rows if is_quota(r))
        print(f"{model['id']:24s} " + " ".join(cells) + f" {errors:>7d} {quota:>6d}")
    print("\nA dash means no scenario exercised that dimension for this model.")
    if any(is_quota(r) for r in results):
        print("Quota-limited runs were not graded. A daily quota needs a paid key, not a longer delay.")


if __name__ == "__main__":
    sys.exit(main())
