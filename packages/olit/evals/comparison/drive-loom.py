#!/usr/bin/env python3
"""Drive loom the way Orbit is actually driven: one persistent session, resumed per turn.

loom's eval runner is a single spawn into a temp cwd with `LOOM_FRESH_SESSION=1` and no
`--continue`, which disables every mechanism Orbit uses for long-running Galaxy work -- the
notebook does not survive, the session is never resumed, and the poller's timer is `unref`'d so
`--mode json` exits before it can tick (galaxy-poller.ts). This drives the native path instead:

  * a persistent cwd, so `notebook.md` and its job blocks survive between turns;
  * a persistent agent dir, so pi's session.jsonl is there for `--continue`;
  * one turn per invocation, resumed, so `session_start` fires its immediate poll and
    auto-resume delivers follow-ups for work that landed while we were away.

Grading stays identical to the Olit arm: the final HGNC symbol in the assistant text.
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
    """The same shape loom's runner synthesizes (evals/lib/matrix.ts:writePiModelsConfig)."""
    agent_dir.mkdir(parents=True, exist_ok=True)
    (agent_dir / "models.json").write_text(json.dumps({"providers": {"tacc-sambanova": {
        "baseUrl": os.environ["PROXY_URL"], "api": "openai-completions",
        "apiKey": "$PROXY_API_KEY",
        "models": [{"id": "gpt-oss-120b", "name": "gpt-oss-120b", "reasoning": True,
                    "input": ["text"], "contextWindow": 128000, "maxTokens": 128000,
                    "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0}}]}}},
        indent=2))


def assistant_text(stdout: str) -> str:
    """What the agent said, and only that.

    `turn_end` carries the assistant message; `message_end` carries the *user* turn, and
    `message_update` is a streaming delta. Within the assistant content, `thinking` items are
    chain of thought, not chat -- grading on them would pass a run that reasoned its way to the
    symbol and never reported it.
    """
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
    # The pinned input spec lives with the Olit scenario; both arms stage from that one source.
    dataset = json.loads((HERE.parent / "scenarios/cryptic-exon-q1/scenario.json").read_text())["dataset"]
    state = pathlib.Path(os.environ.get("LOOM_STATE", HERE / "loom-session-state"))
    cwd, home = state / "cwd", state / "home"
    agent = home / ".pi" / "agent"
    cwd.mkdir(parents=True, exist_ok=True)
    pi_models_config(agent)
    # The binding block is the starting state: same page and history as the Olit arm.
    fixture = HERE / "loom-scenarios/cryptic-exon-q1/cwd/notebook.md"
    if not (cwd / "notebook.md").exists():
        (cwd / "notebook.md").write_text(fixture.read_text())
    # The input, where a desktop agent looks for it. Olit gets it in the bound history because
    # that is its only substrate; loom has a filesystem and reads "I have a file" as a local
    # one. Same file, same pinned revision, each arm reached through its native substrate.
    local = cwd / dataset["name"]
    if not local.exists():
        print(f"    staging {local.name} into the working directory", flush=True)
        urllib.request.urlretrieve(dataset["url"], local)

    env = {**os.environ,
           "PI_CODING_AGENT_DIR": str(agent),
           "PI_SKIP_VERSION_CHECK": "1", "PI_TELEMETRY": "0",
           "HOME": str(home),
           # Without this uvx re-resolves galaxy-mcp per spawn and the MCP handshake
           # loses the race, leaving the agent with no galaxy_* tools at all.
           "UV_CACHE_DIR": os.environ.get("UV_CACHE_DIR", str(pathlib.Path.home() / ".cache/uv"))}
    env.pop("LOOM_FRESH_SESSION", None)

    transcript, started = [], time.time()
    for index, turn in enumerate(scenario["inputs"], start=1):
        args = ["node", str(LOOM / "bin/loom.js"), "--mode", "json",
                "--provider", "tacc-sambanova", "--model", "gpt-oss-120b"]
        turn_env = dict(env)
        if index == 1:
            # The opening turn IS a fresh session, and saying so suppresses the startup
            # greeting. Without it loom greets, that greeting occupies the agent, and our
            # prompt is rejected with "Agent is already processing".
            turn_env["LOOM_FRESH_SESSION"] = "1"
        else:
            args.append("--continue")            # loom branches on this: a real resume
        args.append(turn)
        print(f"--- turn {index}/{len(scenario['inputs'])}: {turn[:60]}...", flush=True)
        done = subprocess.run(args, cwd=cwd, env=turn_env, capture_output=True, text=True,
                              timeout=int(os.environ.get("LOOM_TURN_TIMEOUT", "3600")))
        # Keep the raw stream: it is the trajectory, and when extraction is wrong it is the
        # only way to tell a real result from a parsing bug.
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
