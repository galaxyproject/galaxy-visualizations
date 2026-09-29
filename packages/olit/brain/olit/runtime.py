"""Entry point the JS shell awaits: build the substrate, run the loop driver."""

import logging

from olit import config as config_module
from olit import prompt
from olit.loop import notebook
from olit.loop.agent import LoopDriver
from olit.processes import ProcessRegistry
from olit.skills import SkillRegistry
from olit.substrate import Substrate, cancellation, confirm

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class Session:
    """Everything a turn runs against, built once per config identity and reused across turns."""

    def __init__(self, config):
        # Accepts the dict an in-process caller passes; everything below reads a Config.
        self.config = config_module.parse(config)
        self.identity = self.config.identity()
        self.substrate = Substrate(self.config)
        self.processes = ProcessRegistry().load_packaged()
        self.skills = SkillRegistry().load_packaged()
        self.driver = LoopDriver(self.substrate, self.processes, self.skills)

    async def init(self):
        await self.substrate.init()
        return self

    def rebind(self, config):
        """Point this session at a new turn's context."""
        self.config = config
        self.driver.rebind(session_id=config.get("session_id"), page_id=config.get("record_page_id"))

    async def close(self):
        """Release what the session holds outside the interpreter."""
        await self.substrate.close()

    def _galaxy_status(self):
        """What Galaxy work can run: everything, nothing, or only the tools olit runs itself.

        Not the openapi catalog, which only serves the graph route: it can fail on a server
        whose tools all work, and loading it says nothing about whether an operation can run.
        The two failures are told apart because they leave different tools working.
        """
        if not self.substrate.galaxy.reachable():
            return prompt.GALAXY_UNREACHABLE
        if not self.substrate.ops.available():
            return prompt.OPS_UNAVAILABLE
        return prompt.GALAXY_READY

    def context(self):
        """The brain's own system text: discipline, Galaxy guidance and the skills router."""
        target = self.substrate.llm.target
        blocks = (
            prompt.system_text(
                model=target.model.id,
                provider=target.provider.id,
                galaxy_status=self._galaxy_status(),
                seed_dataset=self.config.get("dataset_id"),
                galaxy_root=self.substrate.galaxy.galaxy_root,
            ),
            self.skills.router_text(),
        )
        return "\n\n".join(t for t in blocks if t)

    async def prepare(self, transcripts, record_page_id, history_id):
        """The transcript with the context block set and the record excerpt refreshed."""
        transcripts = _inject_context(transcripts, self.context())
        excerpt = await notebook.excerpt(self.substrate.galaxy, record_page_id, history_id)
        return _inject_record(transcripts, excerpt)

    async def turn(
        self, transcripts, on_event=None, cancellation=None, confirmation=None, artifacts=None, watching=None
    ):
        return await self.driver.run(transcripts, on_event, cancellation, confirmation, artifacts, watching)

    def diagnostics(self):
        return {
            "galaxy": self._galaxy_status(),
            "catalog": self.substrate.catalog.status(),
            "capabilities": self.substrate.manifest.to_list(),
        }


_session = None


async def _session_for(config):
    """The worker's session, rebuilt only when what it is built from changes."""
    global _session
    if _session is not None and _session.identity == config.identity():
        _session.rebind(config)
        return _session
    if _session is not None:
        # A replaced session still holds a transport.
        await _session.close()
    _session = await Session(config).init()
    return _session


async def run(config, inputs, on_event=None):
    parsed = config_module.parse(config)
    session = await _session_for(parsed)
    transcripts = await session.prepare(inputs["transcripts"], parsed.get("record_page_id"), parsed.get("history_id"))
    try:
        result = await session.turn(
            transcripts,
            on_event,
            cancellation.from_js(),
            confirm.from_js(),
            inputs.get("artifacts"),
            inputs.get("watching"),
        )
    except Exception as e:
        # A failed turn is a result, not a crash.
        logger.exception("turn failed")
        return {
            "logs": [],
            "messages": inputs["transcripts"],
            "new_messages": [],
            "error": {"message": str(e), "status_code": getattr(e, "status_code", None)},
        }
    result["diagnostics"] = session.diagnostics()
    return result


BEGIN = "<!-- olit:context -->"
END = "<!-- /olit:context -->"
RECORD_MARKER = "<!-- olit:record -->"


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
    last_user = next((i for i in range(len(kept) - 1, -1, -1) if kept[i].get("role") == "user"), None)
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
        content = content[:start] + block + content[stop + len(END) :]
    else:
        content = f"{content}\n\n{block}"
    merged = dict(first)
    merged["content"] = content.strip()
    return [merged, *transcripts[1:]]
