#!/usr/bin/env python3
"""Drive loom the way Orbit is driven: one persistent session, resumed per turn.

A persistent cwd keeps the notebook and its job blocks; a persistent agent dir keeps the
session file `--continue` reads; one turn per invocation lets the poller tick on resume and
deliver follow-ups for work that landed in between. Grading matches the Olit arm.
"""

import json
import os
import pathlib
import re
import subprocess
import sys
import urllib.request
import time

HERE = pathlib.Path(__file__).resolve().parent
LOOM = pathlib.Path(os.environ.get("LOOM_DIR", pathlib.Path.home() / "loom"))


def pi_models_config(agent_dir: pathlib.Path) -> None:
    """The model config the runner expects."""
    agent_dir.mkdir(parents=True, exist_ok=True)
    (agent_dir / "models.json").write_text(json.dumps({"providers": {"tacc-sambanova": {
        "baseUrl": os.environ["PROXY_URL"], "api": "openai-completions",
        "apiKey": "$PROXY_API_KEY",
        "models": [{"id": "gpt-oss-120b", "name": "gpt-oss-120b", "reasoning": True,
                    "input": ["text"], "contextWindow": 128000, "maxTokens": 128000,
                    "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0}}]}}},
        indent=2))


def assistant_text(stdout: str) -> str:
    """The assistant's chat text, excluding thinking: reasoning is not a reported answer."""
    out = []
    for line in stdout.splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if event.get("type") != "turn_end":
            continue
        message = event.get("message") or {}
        if message.get("role") != "assistant":
            continue
        for item in message.get("content") or []:
            if isinstance(item, dict) and item.get("type") == "text" and item.get("text"):
                out.append(item["text"])
    return "\n".join(out)


def main() -> int:
    scenario = json.loads((HERE / "loom-scenarios/cryptic-exon-q1/scenario.json").read_text())
    # Both arms stage from the pinned input spec in the Olit scenario.
    dataset = json.loads((HERE.parent / "scenarios/cryptic-exon-q1/scenario.json").read_text())["dataset"]
    state = pathlib.Path(os.environ.get("LOOM_STATE", HERE / "loom-session-state"))
    cwd, home = state / "cwd", state / "home"
    agent = home / ".pi" / "agent"
    cwd.mkdir(parents=True, exist_ok=True)
    pi_models_config(agent)
    # The binding block is the starting state: same page and history as the other arm.
    fixture = HERE / "loom-scenarios/cryptic-exon-q1/cwd/notebook.md"
    if not (cwd / "notebook.md").exists():
        (cwd / "notebook.md").write_text(fixture.read_text())
    # The same input, placed where a desktop agent looks for it.
    local = cwd / dataset["name"]
    if not local.exists():
        print(f"    staging {local.name} into the working directory", flush=True)
        urllib.request.urlretrieve(dataset["url"], local)

    env = {**os.environ,
           "PI_CODING_AGENT_DIR": str(agent),
           "PI_SKIP_VERSION_CHECK": "1", "PI_TELEMETRY": "0",
           "HOME": str(home),
           # Without the shared cache every spawn re-resolves the server and loses the handshake race.
           "UV_CACHE_DIR": os.environ.get("UV_CACHE_DIR", str(pathlib.Path.home() / ".cache/uv"))}
    env.pop("LOOM_FRESH_SESSION", None)

    transcript, started = [], time.time()
    for index, turn in enumerate(scenario["inputs"], start=1):
        args = ["node", str(LOOM / "bin/loom.js"), "--mode", "json",
                "--provider", "tacc-sambanova", "--model", "gpt-oss-120b"]
        turn_env = dict(env)
        if index == 1:
            # The opening turn is a fresh session; saying so suppresses the startup greeting.
            turn_env["LOOM_FRESH_SESSION"] = "1"
        else:
            args.append("--continue")            # loom branches on this: a real resume
        args.append(turn)
        print(f"--- turn {index}/{len(scenario['inputs'])}: {turn[:60]}...", flush=True)
        done = subprocess.run(args, cwd=cwd, env=turn_env, capture_output=True, text=True,
                              timeout=int(os.environ.get("LOOM_TURN_TIMEOUT", "3600")))
        # Keep the raw stream: it is the trajectory, and the check on our own extraction.
        (state / f"turn{index}.jsonl").write_text(done.stdout)
        text = assistant_text(done.stdout)
        transcript.append(text)
        print(f"    exit {done.returncode}, {len(done.stdout.splitlines())} events, "
              f"{len(text)} chars of reply", flush=True)
        if done.returncode != 0 and done.stderr.strip():
            print("    stderr:", done.stderr.strip().splitlines()[0][:160], flush=True)

    chat = "\n".join(transcript)
    hit = bool(re.search(r"\bGNG10\b", chat))
    out = state / "result.json"
    out.write_text(json.dumps({"passed": hit, "durationMs": int((time.time() - started) * 1000),
                               "turns": len(scenario["inputs"]), "chatText": chat}, indent=2))
    print(f"\n{'PASS' if hit else 'FAIL'} cryptic-exon-q1 (loom, native resume) "
          f"-- {int(time.time() - started)}s -- {out}")
    return 0 if hit else 1


if __name__ == "__main__":
    sys.exit(main())
