"""The node transport's framing: an answer arrives whole, and with its own question.

A live run found this the hard way. `list_history_ids` answers ~190 KB, past what a line
reader buffers; the reader gave up mid-answer and every later answer was paired with the
wrong question, so `list_pages` reported a page count from `list_page_revisions`.
"""

import asyncio
import json
import shutil
import subprocess

import pytest

from olit.substrate.galaxy_ops import NodeTransport

pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="the transport needs node")

# Framed the way the real driver frames: the byte length on one line, then that many bytes.
STUB = """
let buffered = Buffer.alloc(0);
let wanted = null;
process.stdin.on("data", (chunk) => {
  buffered = Buffer.concat([buffered, chunk]);
  for (;;) {
    if (wanted === null) {
      const cut = buffered.indexOf(10);
      if (cut < 0) return;
      wanted = Number(buffered.subarray(0, cut).toString("utf8"));
      buffered = buffered.subarray(cut + 1);
    }
    if (buffered.length < wanted) return;
    const request = JSON.parse(buffered.subarray(0, wanted).toString("utf8"));
    buffered = buffered.subarray(wanted);
    wanted = null;
    const envelope = { success: true, data: { name: request.name, pad: "x".repeat(request.args.size) } };
    const body = Buffer.from(JSON.stringify({ id: request.id, envelope }), "utf8");
    process.stdout.write(`${body.length}\\n`);
    process.stdout.write(body);
  }
});
"""


@pytest.fixture
def transport(tmp_path):
    driver = tmp_path / "stub.mjs"
    driver.write_text(STUB)
    return NodeTransport("http://galaxy.invalid", "k", driver=str(driver))


def test_an_answer_far_past_a_line_buffer_arrives_whole(transport):
    async def go():
        envelope = await transport.run("list_history_ids", {"size": 300_000})
        await transport.close()
        return envelope

    envelope = asyncio.run(go())
    assert len(envelope["data"]["pad"]) == 300_000
    assert json.loads(json.dumps(envelope))["success"] is True


def test_each_answer_comes_back_with_its_own_question(transport):
    """The failure this guards against was silent: every answer was one question behind."""

    async def go():
        names = []
        for name in ("get_histories", "list_history_ids", "list_pages", "list_page_revisions"):
            # A large answer in the middle is what desynchronised the stream before.
            size = 200_000 if name == "list_history_ids" else 10
            envelope = await transport.run(name, {"size": size})
            names.append(envelope["data"]["name"])
        await transport.close()
        return names

    assert asyncio.run(go()) == ["get_histories", "list_history_ids", "list_pages", "list_page_revisions"]


def test_a_driver_that_is_not_there_is_not_available(tmp_path):
    assert not NodeTransport("http://galaxy.invalid", "k", driver=str(tmp_path / "absent.mjs")).available()
    assert not NodeTransport(None, "k").available()


def test_closing_a_session_releases_its_driver(tmp_path):
    """Outside the browser each session starts a node process; nothing else reaps them."""
    driver = tmp_path / "stub.mjs"
    driver.write_text(STUB)

    def running():
        found = subprocess.run(["pgrep", "-f", str(driver)], capture_output=True, text=True).stdout.split()
        return len(found)

    async def go():
        transports = [NodeTransport("http://galaxy.invalid", "k", driver=str(driver)) for _ in range(3)]
        for t in transports:
            await t.run("get_histories", {"size": 10})
        started = running()
        for t in transports:
            await t.close()
        return started, running()

    started, left = asyncio.run(go())
    assert started >= 3, f"expected a process per transport, saw {started}"
    assert left == 0, f"{left} driver process(es) survived close()"


def test_closing_twice_is_harmless(tmp_path):
    driver = tmp_path / "stub.mjs"
    driver.write_text(STUB)
    transport = NodeTransport("http://galaxy.invalid", "k", driver=str(driver))

    async def go():
        await transport.run("get_histories", {"size": 1})
        await transport.close()
        await transport.close()

    asyncio.run(go())


# The browser executor states these identically (src/pyodide/galaxy-ops-executor.test.ts pins
# it there). Running the real driver here is what stops the two wordings drifting apart.
def test_the_real_driver_names_an_operation_it_does_not_have():
    transport = NodeTransport("http://galaxy.invalid", "k")
    if not transport.available():
        pytest.skip("the real driver needs node and a resolvable galaxy-ops")

    async def go():
        envelope = await transport.run("no_such_operation", {})
        await transport.close()
        return envelope

    envelope = asyncio.run(go())
    assert envelope == {
        "success": False,
        "errorKind": "not_found",
        "message": "galaxy-ops has no operation named 'no_such_operation'",
    }


def test_the_real_driver_reports_a_bug_in_an_operation_as_an_envelope():
    """galaxy-ops rethrows anything that is not a Galaxy error; neither executor lets it out."""
    transport = NodeTransport("http://galaxy.invalid", "k")
    if not transport.available():
        pytest.skip("the real driver needs node and a resolvable galaxy-ops")

    async def go():
        # `query` is used as a string inside the operation, so a number throws a TypeError.
        envelope = await transport.run("search_iwc_workflows", {"query": 5})
        await transport.close()
        return envelope

    envelope = asyncio.run(go())
    assert envelope["success"] is False
    assert envelope["errorKind"] == "unexpected"
    assert "toLowerCase" in envelope["message"]
