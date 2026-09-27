"""The scoped, capability-gated Galaxy API surface.

Loaded on first use, not at boot. The openapi document is ~2 MB and only the graph route and
`registry/python/galaxy.py` call through it, so a session that never takes that route never
pays for it -- and a session whose catalog fails still runs every Galaxy tool, because those
go through the Galaxy client and galaxy-ops instead.
"""

import copy
import logging

from .catalog_sources import load_providers

logger = logging.getLogger(__name__)


class Catalog:
    def __init__(self, config, manifest):
        self.config = config
        self.manifest = manifest
        # Mutated in place and shared by every scoped view, so whichever one loads the
        # catalog, the others see it. A scoped view is a shallow copy.
        self._loaded = {"providers": [], "targets": {}, "error": None, "asked": False}

    async def _ensure(self):
        """Load once, on the first call that needs it. Tolerant: a failure is reported, not raised."""
        state = self._loaded
        if state["asked"]:
            return
        state["asked"] = True
        try:
            for provider in await load_providers(self.config):
                state["providers"].append(provider)
                state["targets"][provider.target().name] = provider.target()
        except Exception as e:
            logger.warning("catalog unavailable (root=%s): %s", self.config.get("galaxy_root"), e)
            state["error"] = str(e)
            return
        logger.info("catalog loaded: %d ops (root=%s)", self.status()["op_count"], self.config.get("galaxy_root"))

    def scoped(self, manifest):
        """A view gated by a narrower manifest, sharing the SAME loaded providers."""
        view = copy.copy(self)
        view.manifest = manifest
        return view

    def status(self):
        """What the catalog holds. Never loads it, so asking is not taking the graph route."""
        state = self._loaded
        op_count = 0
        for provider in state["providers"]:
            catalog = getattr(provider, "openapi", None)
            if catalog is not None:
                op_count += len(catalog.index)
        return {
            "loaded": bool(state["providers"]),
            "op_count": op_count,
            "error": state["error"],
            "asked": state["asked"],
        }

    def _resolve(self, target_name):
        for provider in self._loaded["providers"]:
            op = provider.resolve_op(target_name)
            if op:
                return op
        return None

    async def call(self, target, input=None):
        """Call a catalog op by name (e.g. 'galaxy.histories.get')."""
        await self._ensure()
        # Distinguish an unloaded spec from an unknown op.
        if not self._loaded["providers"]:
            return {
                "ok": False,
                "error": {
                    "code": "catalog_unavailable",
                    "message": self._loaded["error"] or "Galaxy OpenAPI catalog did not load",
                },
            }

        op = self._resolve(target)
        if not op:
            return {"ok": False, "error": {"code": "unknown_api_op", "message": target}}

        if not self.manifest.allows(op.capability):
            return {
                "ok": False,
                "error": {
                    "code": "capability_denied",
                    "message": target,
                    "capability": op.capability,
                },
            }

        provider_target = self._loaded["targets"][op.target]
        try:
            result = await op.handler(provider_target, input or {}, op.meta)
            return {"ok": True, "result": result}
        except Exception as e:
            logger.warning("catalog call failed: %s - %s", target, e)
            return {"ok": False, "error": {"code": "api_call_failed", "message": str(e)}}
