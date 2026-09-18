"""Entry point the JS shell awaits: build the substrate, run the loop driver."""

import logging

from olite import config as config_module
from olite import prompt
from olite.drivers import LoopDriver
from olite.drivers.loop import notebook
from olite.registry import ProcessRegistry, SkillRegistry
from olite.substrate import Substrate, cancellation, confirm

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def run(config, inputs, on_event=None):
    config = config_module.parse(config)
    substrate = await Substrate(config).init()
    processes = ProcessRegistry().load_packaged()
    skills = SkillRegistry().load_packaged()
    driver = LoopDriver(substrate, processes, skills, confirm.from_js())
    # The shell seeds the identity prompt; the brain appends discipline and the router.
    target = substrate.llm.target
    context = "\n\n".join(
        t
        for t in (
            prompt.system_text(
                model=target.model.id,
                provider=target.provider.id,
                # loom gates its Galaxy guidance on a live connection.
                galaxy_ok=bool(substrate.catalog.status().get("op_count")),
            ),
            skills.router_text(),
        )
        if t
    )
    transcripts = _inject_context(inputs["transcripts"], context)
    # loom keeps the record out of the cached prefix; it changes every time the agent writes.
    transcripts = _inject_record(
        transcripts, await notebook.excerpt(substrate.galaxy, config.get("history_id"))
    )
    try:
        result = await driver.run(transcripts, on_event, cancellation.from_js())
    except Exception as e:
        # A failed turn is a result, not a crash.
        logger.exception("turn failed")
        return {
            "logs": [],
            "messages": inputs["transcripts"],
            "new_messages": [],
            "error": {"message": str(e), "status_code": getattr(e, "status_code", None)},
        }
    # Diagnostics for the shell to surface.
    result["diagnostics"] = {
        "catalog": substrate.catalog.status(),
        "capabilities": substrate.manifest.to_list(),
    }
    return result


BEGIN = "<!-- olite:context -->"
END = "<!-- /olite:context -->"
RECORD_MARKER = "<!-- olite:record -->"


def _inject_record(transcripts, text):
    """Refresh the record excerpt as its own message, dropping the previous copy.

    Placed before the last user turn, not after it: the record is agent-writable and
    carries dataset names, and the final slot is where a model is most prone to read
    content as the operative instruction. loom: context.ts `insert`.
    """
    kept = [m for m in transcripts if RECORD_MARKER not in (m.get("content") or "")]
    if not text:
        return kept
    message = {"role": "system", "content": f"{RECORD_MARKER}\n{text}"}
    last_user = next(
        (i for i in range(len(kept) - 1, -1, -1) if kept[i].get("role") == "user"), None
    )
    if last_user is None:
        return [*kept, message]
    return [*kept[:last_user], message, *kept[last_user:]]


def _inject_context(transcripts, text):
    """Put the brain's context blocks in the system message, between markers."""
    if not text or not transcripts:
        return transcripts
    block = f"{BEGIN}\n{text}\n{END}"
    first = transcripts[0]
    if first.get("role") != "system":
        return [{"role": "system", "content": block}, *transcripts]

    content = first.get("content") or ""
    start, stop = content.find(BEGIN), content.find(END)
    if start != -1 and stop > start:
        content = content[:start] + block + content[stop + len(END):]
    else:
        content = f"{content}\n\n{block}"
    merged = dict(first)
    merged["content"] = content.strip()
    return [merged, *transcripts[1:]]
